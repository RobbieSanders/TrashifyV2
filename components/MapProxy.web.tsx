import React, { useEffect } from 'react';
import { View, Text } from 'react-native';

export const Marker = ({ coordinate, pinColor, ...props }: any) => {
  return (
    <View style={{
      width: 16,
      height: 16,
      backgroundColor: pinColor === 'red' ? '#EF4444' : pinColor === 'blue' ? '#3B82F6' : '#F59E0B',
      borderRadius: 8,
      borderWidth: 2,
      borderColor: '#fff',
      margin: 2,
    }} />
  );
};

export default function MapWeb(props: any) {
  // Ensure any loading overlays in screens are dismissed on web
  useEffect(() => {
    props?.onMapReady?.();
  }, []);

  const disabled = true; // toggle if you ever want to show a visual placeholder

  if (disabled) {
    return (
      <View style={[{ 
        flex: 1,
        backgroundColor: '#F8FAFC',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 200,
        borderRadius: 8,
      }, props.style]}>
        <Text style={{ 
          fontSize: 14,
          color: '#64748B',
          textAlign: 'center',
          paddingHorizontal: 16,
        }}>
          Map disabled on web. Use the mobile app for the full experience.
        </Text>
      </View>
    );
  }

  // Minimal placeholder (not used when disabled=true)
  return (
    <View style={[{ 
      flex: 1, 
      backgroundColor: '#E5E7EB',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 200,
    }, props.style]}>
      <Text style={{ fontSize: 16, color: '#374151' }}>Map preview (web)</Text>
      <View style={{ flexDirection: 'row', marginTop: 8 }}>{props.children}</View>
    </View>
  );
}
