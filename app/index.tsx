import { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, SafeAreaView, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';

export default function SearchScreen() {
  const [from, setFrom] = useState('昆明');
  const [to, setTo] = useState('北京');
  const [name, setName] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [preference, setPreference] = useState('cheapest'); // 新增：用户偏好

  // 读取保存的乘客信息
  useEffect(() => {
    AsyncStorage.multiGet(['name', 'idNumber', 'phone']).then(values => {
      values.forEach(([key, value]) => {
        if (value) {
          if (key === 'name') setName(value);
          if (key === 'idNumber') setIdNumber(value);
          if (key === 'phone') setPhone(value);
        }
      });
    });
  }, []);

  const tomorrow = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  };

  const [date, setDate] = useState(tomorrow());

  const performSearch = async () => {
    // 保存乘客信息和偏好
    await AsyncStorage.multiSet([
      ['name', name],
      ['idNumber', idNumber],
      ['phone', phone],
      ['preference', preference], // 保存偏好
    ]);

    // 跳转到结果页
    router.push({
      pathname: '/results',
      params: { from, to, date, preference }, // 传递偏好
    });
  };

  const doSearch = async () => {
    // 验证输入
    if (!from.trim() || !to.trim()) {
      Alert.alert('提示', '请输入出发和到达城市');
      return;
    }

    if (!name.trim() || !idNumber.trim() || !phone.trim()) {
      Alert.alert(
        '提示',
        '乘客信息未填写完整，将无法自动填表。是否继续？',
        [
          { text: '取消', style: 'cancel' },
          { text: '继续', onPress: () => performSearch() },
        ]
      );
      return;
    }

    await performSearch();
  };

  const swap = () => {
    const temp = from;
    setFrom(to);
    setTo(temp);
  };

  // 生成日期选项
  const dates = [];
  const labels = ['今天', '明天', '后天'];
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const ds = d.toISOString().split('T')[0];
    const wd = '日一二三四五六'[d.getDay()];
    dates.push({
      label: i < 3 ? labels[i] : `${d.getMonth() + 1}/${d.getDate()}`,
      sub: `周${wd}`,
      value: ds,
    });
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView style={s.scroll}>
        <View style={s.header}>
          <Text style={s.title}>✈️ 机票助手</Text>
          <Text style={s.subtitle}>多平台比价 · 自动填表 · 一键订票</Text>
        </View>

        {/* 城市选择 */}
        <View style={s.card}>
          <View style={s.cityRow}>
            <View style={s.cityBox}>
              <Text style={s.label}>出发</Text>
              <TextInput style={s.cityInput} value={from} onChangeText={setFrom} placeholder="出发城市" />
            </View>
            <TouchableOpacity style={s.swapBtn} onPress={swap}>
              <Text style={s.swapText}>⇄</Text>
            </TouchableOpacity>
            <View style={s.cityBox}>
              <Text style={s.label}>到达</Text>
              <TextInput style={s.cityInput} value={to} onChangeText={setTo} placeholder="到达城市" />
            </View>
          </View>

          {/* 日期选择 */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.dateScroll}>
            {dates.map(d => (
              <TouchableOpacity
                key={d.value}
                style={[s.dateTag, date === d.value && s.dateTagOn]}
                onPress={() => setDate(d.value)}
              >
                <Text style={[s.dateLabel, date === d.value && s.dateLabelOn]}>{d.label}</Text>
                <Text style={[s.dateSub, date === d.value && s.dateLabelOn]}>{d.sub}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* 偏好选择 */}
          <View style={s.preferenceContainer}>
            <Text style={s.preferenceTitle}>🎯 自动选择偏好</Text>
            <View style={s.preferenceRow}>
              <TouchableOpacity
                style={[s.preferenceBtn, preference === 'cheapest' && s.preferenceBtnOn]}
                onPress={() => setPreference('cheapest')}
              >
                <Text style={[s.preferenceBtnText, preference === 'cheapest' && s.preferenceBtnTextOn]}>💰 最便宜</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.preferenceBtn, preference === 'fastest' && s.preferenceBtnOn]}
                onPress={() => setPreference('fastest')}
              >
                <Text style={[s.preferenceBtnText, preference === 'fastest' && s.preferenceBtnTextOn]}>⚡ 最快</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.preferenceBtn, preference === 'direct' && s.preferenceBtnOn]}
                onPress={() => setPreference('direct')}
              >
                <Text style={[s.preferenceBtnText, preference === 'direct' && s.preferenceBtnTextOn]}>✈️ 直飞</Text>
              </TouchableOpacity>
            </View>
            <Text style={s.preferenceTip}>订票时自动选择符合偏好的航班和套餐</Text>
          </View>

          <TouchableOpacity style={s.searchBtn} onPress={doSearch}>
            <Text style={s.searchBtnText}>🔍 搜索航班</Text>
          </TouchableOpacity>
        </View>

        {/* 乘客信息 */}
        <View style={s.card}>
          <Text style={s.cardTitle}>👤 乘客信息（自动填表用）</Text>
          <TextInput style={s.input} value={name} onChangeText={setName} placeholder="姓名" />
          <TextInput style={s.input} value={idNumber} onChangeText={setIdNumber} placeholder="身份证号" keyboardType="number-pad" />
          <TextInput style={s.input} value={phone} onChangeText={setPhone} placeholder="手机号" keyboardType="phone-pad" />
          <Text style={s.tip}>填写后保存在本地，订票时自动填入</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f0f2f5' },
  scroll: { flex: 1 },
  header: { backgroundColor: '#1a73e8', padding: 28, paddingTop: 20, alignItems: 'center' },
  title: { fontSize: 22, fontWeight: '700', color: '#fff' },
  subtitle: { fontSize: 12, color: 'rgba(255,255,255,.7)', marginTop: 4 },
  card: { backgroundColor: '#fff', margin: 12, marginTop: 14, borderRadius: 14, padding: 18, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 },
  cardTitle: { fontSize: 15, fontWeight: '600', marginBottom: 12 },
  cityRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  cityBox: { flex: 1, alignItems: 'center' },
  label: { fontSize: 11, color: '#999', marginBottom: 4 },
  cityInput: { fontSize: 20, fontWeight: '600', textAlign: 'center', borderBottomWidth: 2, borderBottomColor: '#eee', paddingVertical: 6, width: '100%' },
  swapBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, borderColor: '#ddd', alignItems: 'center', justifyContent: 'center' },
  swapText: { fontSize: 16, color: '#1a73e8' },
  dateScroll: { marginBottom: 14 },
  dateTag: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#e0e0e0', marginRight: 8, alignItems: 'center' },
  dateTagOn: { backgroundColor: '#1a73e8', borderColor: '#1a73e8' },
  dateLabel: { fontSize: 13, color: '#333' },
  dateSub: { fontSize: 10, color: '#999', marginTop: 1 },
  dateLabelOn: { color: '#fff' },
  preferenceContainer: { marginBottom: 16, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  preferenceTitle: { fontSize: 13, fontWeight: '600', marginBottom: 10, color: '#666' },
  preferenceRow: { flexDirection: 'row', gap: 8 },
  preferenceBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#e0e0e0', alignItems: 'center', backgroundColor: '#f8f9fa' },
  preferenceBtnOn: { backgroundColor: '#e3f2fd', borderColor: '#1a73e8' },
  preferenceBtnText: { fontSize: 13, color: '#666' },
  preferenceBtnTextOn: { color: '#1a73e8', fontWeight: '600' },
  preferenceTip: { fontSize: 11, color: '#999', marginTop: 8, textAlign: 'center' },
  searchBtn: { backgroundColor: '#1a73e8', padding: 14, borderRadius: 10, alignItems: 'center' },
  searchBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  input: { borderWidth: 1, borderColor: '#eee', borderRadius: 8, padding: 12, fontSize: 15, marginBottom: 10 },
  tip: { fontSize: 11, color: '#bbb', marginTop: 2 },
});
