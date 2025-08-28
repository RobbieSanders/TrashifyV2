// Back-compat shim: some older code/imports referenced 'notificationStore' (singular).
// The real store file is 'notificationsStore'. Re-export everything here to avoid runtime resolution errors.
export * from './notificationsStore';
