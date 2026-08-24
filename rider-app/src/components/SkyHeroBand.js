// rider-app/src/components/SkyHeroBand.js — the animated hero used only by PinLoginScreen.
// Reproduces cleaned.html's three CSS animations with React Native's Animated API:
//   • starTwinkle   → opacity/scale pulse per star, staggered by (i % 6) * 0.4s, looping
//   • cloudDrift    → two ☁️ glyphs translating left→right on independent loops (24s / 32s)
//   • celestialFloat→ the scene icon (🌙/🌅/🔆/🌤️/🌇/🌆) gently bobbing up and down
// All three run on the native driver (opacity/transform only) so they stay smooth even
// while the rest of the PIN screen is busy validating input.
import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, Easing, StyleSheet, AccessibilityInfo } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { PIN_HERO_GRADIENTS, PIN_HERO_STAR_POSITIONS } from '../constants/pinHeroScenes';

function Star({ left, top, delay, reduceMotion }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduceMotion) return; // respects the OS reduce-motion setting, same as cleaned.html's prefers-reduced-motion query
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 1300, delay, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 1300, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [reduceMotion]);

  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0.15, 0.95] });
  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] });
  return (
    <Animated.View style={[styles.star, { left: `${left}%`, top: `${top}%`, opacity, transform: [{ scale }] }]} />
  );
}

function Cloud({ style, duration, delayMs, reduceMotion }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.timing(anim, { toValue: 1, duration, delay: delayMs, easing: Easing.linear, useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [reduceMotion]);

  // translateX sweeps from just off the left edge to just past the right edge, then restarts — cloudDrift
  const translateX = anim.interpolate({ inputRange: [0, 1], outputRange: [-40, 360] });
  return (
    <Animated.Text style={[styles.cloud, style, { transform: [{ translateX }] }]}>☁️</Animated.Text>
  );
}

function Celestial({ icon, top, left, reduceMotion }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 3000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 3000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [reduceMotion]);

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [0, -10] }); // -8% of hero height ≈ 10px
  return (
    <Animated.Text style={[styles.celestial, { top, left, transform: [{ translateX: -19 }, { translateY }] }]}>{icon}</Animated.Text>
  );
}

export default function SkyHeroBand({ scene, onBack, chipLabel, avatarInitial, greeting, subtitle }) {
  const [reduceMotion, setReduceMotion] = React.useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion); // mirrors the prototype's @media(prefers-reduced-motion) rule
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => sub.remove();
  }, []);

  const gradient = PIN_HERO_GRADIENTS[scene.key] || PIN_HERO_GRADIENTS.evening;

  return (
    <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
      {onBack && <Text style={styles.backLink} onPress={onBack}>← Back</Text>}

      {scene.stars && PIN_HERO_STAR_POSITIONS.map(([left, top], i) => (
        <Star key={i} left={left} top={top} delay={(i % 6) * 400} reduceMotion={reduceMotion} />
      ))}
      {scene.clouds && (
        <>
          <Cloud style={styles.cloud1} duration={24000} delayMs={0} reduceMotion={reduceMotion} />
          <Cloud style={styles.cloud2} duration={32000} delayMs={-10000} reduceMotion={reduceMotion} />
        </>
      )}
      <Celestial icon={scene.icon} top={scene.pos.top} left={scene.pos.left} reduceMotion={reduceMotion} />

      <View style={styles.sceneChip}><Text style={styles.sceneChipText}>{scene.icon} {chipLabel}</Text></View>
      <View style={styles.avatar}><Text style={styles.avatarText}>{avatarInitial || '👋'}</Text></View>
      <Text style={styles.greeting}>{greeting}</Text>
      <Text style={styles.sub}>{subtitle}</Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  hero: { paddingHorizontal: 20, paddingTop: 34, paddingBottom: 30, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, alignItems: 'center', overflow: 'hidden' },
  backLink: { position: 'absolute', top: 14, left: 20, zIndex: 3, color: 'rgba(255,255,255,.8)', fontSize: 12.5, fontWeight: '700' },
  star: { position: 'absolute', width: 3, height: 3, borderRadius: 1.5, backgroundColor: '#fff' },
  cloud: { position: 'absolute', fontSize: 26 },
  cloud1: { top: '22%', opacity: 0.5 },
  cloud2: { top: '40%', fontSize: 19, opacity: 0.35 },
  celestial: { position: 'absolute', fontSize: 38, textShadowColor: 'rgba(255,255,255,.4)', textShadowRadius: 16 },
  sceneChip: { position: 'absolute', top: 14, right: 16, zIndex: 3, backgroundColor: 'rgba(255,255,255,.16)', borderRadius: 999, paddingVertical: 5, paddingHorizontal: 10 },
  sceneChipText: { color: '#fff', fontSize: 10.5, fontWeight: '700' },
  avatar: { zIndex: 2, width: 64, height: 64, borderRadius: 32, marginBottom: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ff7a1a', shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
  avatarText: { fontSize: 28, fontWeight: '800', color: '#fff' },
  greeting: { zIndex: 2, fontSize: 21, fontWeight: '800', color: '#fff', marginBottom: 4, textAlign: 'center' },
  sub: { zIndex: 2, fontSize: 12.5, color: 'rgba(255,255,255,.8)', textAlign: 'center' },
});
