// Safe fallback: if this file is resolved, forward to the web implementation.
// Platform-specific files MapProxy.ios.tsx and MapProxy.android.tsx will be
// chosen on native platforms, so this avoids importing native-only modules here.
import { Platform } from 'react-native';

let MapView: any;
let Marker: any;

if (Platform.OS === 'android') {
	const mod = require('./MapProxy.android');
	MapView = mod.default;
	Marker = mod.Marker;
} else if (Platform.OS === 'ios') {
	const mod = require('./MapProxy.ios');
	MapView = mod.default;
	Marker = mod.Marker;
} else {
	const mod = require('./MapProxy.web');
	MapView = mod.default;
	Marker = mod.Marker;
}

export { Marker };
export default MapView;
