import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface CleeviLogoProps {
  size?: 'small' | 'medium' | 'large' | 'xlarge';
  showText?: boolean;
  variant?: 'icon' | 'text' | 'both';
  color?: string;
}

export function CleeviLogo({ size = 'medium', showText = true, variant = 'both', color = '#1E88E5' }: CleeviLogoProps) {
  const dimensions = {
    small: { iconSize: 32, fontSize: 20, containerSize: 36, textWidth: 90 },
    medium: { iconSize: 40, fontSize: 24, containerSize: 44, textWidth: 110 },
    large: { iconSize: 48, fontSize: 28, containerSize: 52, textWidth: 130 },
    xlarge: { iconSize: 70, fontSize: 42, containerSize: 74, textWidth: 180 }
  };

  const { iconSize, fontSize, containerSize, textWidth } = dimensions[size];

  if (variant === 'text') {
    // Show only the text
    return (
      <Text style={[styles.logoText, { fontSize, color: '#0F172A' }]}>
        Cleevi
      </Text>
    );
  }

  if (variant === 'icon') {
    // Show only the icon
    return (
      <View style={[
        styles.iconContainer, 
        { 
          width: containerSize, 
          height: containerSize, 
          backgroundColor: color,
          borderRadius: containerSize * 0.25
        }
      ]}>
        <View style={styles.iconWrapper}>
          {/* Main C shape - clearly defined C */}
          <View style={[styles.cShape, { 
            width: iconSize * 0.7, 
            height: iconSize * 0.7,
            borderWidth: iconSize * 0.1,
            borderRadius: iconSize * 0.35
          }]} />
          {/* Inner spiral swirl */}
          <View style={[styles.innerSpiral, { 
            width: iconSize * 0.35, 
            height: iconSize * 0.35,
            borderWidth: iconSize * 0.05,
            borderRadius: iconSize * 0.175,
            top: iconSize * 0.1,
            left: iconSize * 0.15
          }]} />
          {/* Sparkle */}
          <View style={[styles.sparkle, { 
            top: iconSize * 0.08, 
            right: iconSize * 0.08,
            width: iconSize * 0.12,
            height: iconSize * 0.12
          }]}>
            <View style={[styles.sparkleVertical, { 
              width: iconSize * 0.02,
              height: iconSize * 0.12,
              backgroundColor: 'white'
            }]} />
            <View style={[styles.sparkleHorizontal, { 
              width: iconSize * 0.12,
              height: iconSize * 0.02,
              backgroundColor: 'white'
            }]} />
          </View>
        </View>
      </View>
    );
  }

  // Show both icon and text (default)
  return (
    <View style={[styles.container, { flexDirection: 'row', alignItems: 'center' }]}>
      {/* Icon */}
      <View style={[
        styles.iconContainer, 
        { 
          width: containerSize, 
          height: containerSize, 
          backgroundColor: color,
          borderRadius: containerSize * 0.25,
          marginRight: 10
        }
      ]}>
        <View style={styles.iconWrapper}>
          {/* Main C shape - clearly defined C */}
          <View style={[styles.cShape, { 
            width: iconSize * 0.7, 
            height: iconSize * 0.7,
            borderWidth: iconSize * 0.1,
            borderRadius: iconSize * 0.35
          }]} />
          {/* Inner spiral swirl */}
          <View style={[styles.innerSpiral, { 
            width: iconSize * 0.35, 
            height: iconSize * 0.35,
            borderWidth: iconSize * 0.05,
            borderRadius: iconSize * 0.175,
            top: iconSize * 0.1,
            left: iconSize * 0.15
          }]} />
          {/* Sparkle */}
          <View style={[styles.sparkle, { 
            top: iconSize * 0.08, 
            right: iconSize * 0.08,
            width: iconSize * 0.12,
            height: iconSize * 0.12
          }]}>
            <View style={[styles.sparkleVertical, { 
              width: iconSize * 0.02,
              height: iconSize * 0.12,
              backgroundColor: 'white'
            }]} />
            <View style={[styles.sparkleHorizontal, { 
              width: iconSize * 0.12,
              height: iconSize * 0.02,
              backgroundColor: 'white'
            }]} />
          </View>
        </View>
      </View>
      
      {/* Text */}
      {showText && (
        <Text style={[styles.logoText, { fontSize, color: '#0F172A' }]}>
          Cleevi
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  iconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  iconWrapper: {
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cShape: {
    borderColor: 'white',
    borderTopColor: 'white',
    borderLeftColor: 'white',
    borderBottomColor: 'white',
    borderRightColor: 'transparent', // This creates the C opening
  },
  innerSpiral: {
    position: 'absolute',
    borderColor: 'white',
    borderTopColor: 'white',
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: 'white',
    transform: [{ rotate: '180deg' }], // Creates the spiral effect
  },
  sparkle: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sparkleVertical: {
    position: 'absolute',
    borderRadius: 1,
  },
  sparkleHorizontal: {
    position: 'absolute',
    borderRadius: 1,
  },
  logoText: {
    fontWeight: '800',
    letterSpacing: 1,
    fontFamily: 'System',
    textShadowColor: 'rgba(0, 0, 0, 0.1)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});
