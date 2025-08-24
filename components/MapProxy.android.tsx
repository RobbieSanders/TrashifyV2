import React from 'react';
import { View, Text } from 'react-native';

let MapView: any = null;
let Marker: any = null;

// Prefer expo-maps in Expo Go (free for dev), fallback to react-native-maps
try {
	const mod = require('expo-maps');
	MapView = mod.default || mod.MapView || mod;
	Marker = mod.Marker || ((_props: any) => null);
} catch (e) {
	try {
		const mod = require('react-native-maps');
		MapView = mod.default || mod.MapView || mod;
		Marker = mod.Marker || ((_props: any) => null);
	} catch (e2) {
		// Fallback placeholder if no map provider is available
		MapView = function MapFallback(props: any) {
			return (
				<View style={[{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1F5F9' }, props.style]}>
					<Text style={{ color: '#475569', textAlign: 'center', paddingHorizontal: 16 }}>
						Map not available in this build. Use Expo Go (expo-maps) or a dev build.
					</Text>
				</View>
			);
		};
		Marker = (_props: any) => null;
	}
}

export { Marker };
export default MapView;
