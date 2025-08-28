import { create } from 'zustand';
import type { Job, Coordinates } from '../utils/types';

type State = {
  jobs: Job[];
  workRadius: number; // Worker's radius in miles
  createJob: (input: { address: string; destination: Coordinates; hostId?: string; hostFirstName?: string; hostLastName?: string; notes?: string; needsApproval?: boolean }) => Job;
  acceptJob: (id: string, start: Coordinates, workerId?: string) => void;
  tickJob: (id: string, delta?: number) => void; // simulate movement
  completeJob: (id: string) => void;
  approveJob: (id: string) => void;
  cancelJob: (id: string, userId: string, reason?: string) => void;
  setJobs: (jobs: Job[]) => void; // replace local state from Firestore
  setWorkRadius: (radius: number) => void; // Update work radius
};

export const useTrashifyStore = create<State>((set, get) => ({
  jobs: [],
  workRadius: 10, // Default 10 miles
  setJobs: (jobs) => set({ jobs }),
  setWorkRadius: (radius) => set({ workRadius: radius }),
  createJob: ({ address, destination, hostId, hostFirstName, hostLastName, notes, needsApproval }) => {
    const job: Job = {
      id: Math.random().toString(36).slice(2),
      address,
      destination,
      status: needsApproval ? 'pending_approval' : 'open',
      createdAt: Date.now(),
      hostId,
      hostFirstName,
      hostLastName,
      notes,
      needsApproval,
    };
    set(s => ({ jobs: [job, ...s.jobs] }));
    return job;
  },
  acceptJob: (id, start, workerId) => {
    set(s => ({
      jobs: s.jobs.map(j => j.id === id ? { ...j, status: 'accepted', acceptedAt: Date.now(), startLocation: start, workerLocation: start, progress: 0, workerId: workerId ?? j.workerId } : j)
    }));
  },
  tickJob: (id, delta = 0.05) => {
    const { jobs } = get();
    const job = jobs.find(j => j.id === id);
    if (!job || job.status === 'completed') return;
    const p = Math.min(1, (job.progress ?? 0) + delta);
    const start = job.startLocation ?? job.destination;
    const lat = start.latitude + (job.destination.latitude - start.latitude) * p;
    const lng = start.longitude + (job.destination.longitude - start.longitude) * p;
    set(s => ({
      jobs: s.jobs.map(j => j.id === id ? { ...j, status: p >= 1 ? 'completed' : 'in_progress', progress: p, workerLocation: { latitude: lat, longitude: lng } } : j)
    }));
  },
  completeJob: (id) => set(s => ({ jobs: s.jobs.map(j => j.id === id ? { ...j, status: 'completed', progress: 1 } : j) })),
  approveJob: (id) => set(s => ({ 
    jobs: s.jobs.map(j => j.id === id ? { ...j, status: 'open', approvedAt: Date.now(), needsApproval: false } : j) 
  })),
  cancelJob: (id, userId, reason) => set(s => ({ 
    jobs: s.jobs.map(j => j.id === id ? { 
      ...j, 
      status: 'cancelled', 
      cancelledAt: Date.now(), 
      cancelledBy: userId,
      cancellationReason: reason || 'User cancelled'
    } : j) 
  })),
}));
