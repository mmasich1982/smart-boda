// rider-app/src/screens/financialPerformance/LogContributionScreen.js
// SCAFFOLD -- cleaned.html's prototype has a distinct case/render function for this screen,
// but no file for it exists anywhere across the five developer guides. Distinct from AddSavingsContributionScreen -- this is for Goals (SB-17), not Savings (SB-16). Not given a file in Module D's guide; GoalsScreen.js's docx description only mentions 'My Goals list, New Goal, and Goal Summary', not a contribution-logging step.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import BackLink from '../../components/BackLink';
import colors from '../../theme/colors';

export default function LogContributionScreen({ navigation }) {
  return (
    <View style={styles.container}>
      <BackLink onPress={() => navigation.goBack()} />
      <Text style={styles.title}>Log a Goal Contribution</Text>
      <Text>TODO: implement -- see docs/NAVIGATION_VALIDATION_REPORT.md for context on this gap.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: colors.cream },
  title: { fontSize: 20, fontWeight: '700', marginVertical: 12 },
});
