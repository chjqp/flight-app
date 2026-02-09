import { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, SafeAreaView, ActivityIndicator, Platform, Alert } from 'react-native';
import { WebView } from 'react-native-webview';
import { useLocalSearchParams, router } from 'expo-router';

interface Flight {
  platform: string;
  price: number;
  flightNo: string;
  airline: string;
  depTime: string;
  arrTime: string;
  duration: string;
  stops: number;
}

export default function ResultsScreen() {
  const { from, to, date } = useLocalSearchParams<{ from: string; to: string; date: string }>();
  const [flights, setFlights] = useState<Flight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showWebView, setShowWebView] = useState(Platform.OS !== 'web');
  const webviewRef = useRef<WebView>(null);
  const [retryCount, setRetryCount] = useState(0);

  // 去哪儿搜索URL
  const qunarUrl = `https://m.flight.qunar.com/ncs/page/flightlist?depCity=${encodeURIComponent(from!)}&arrCity=${encodeURIComponent(to!)}&goDate=${date}`;

  // Web端fallback：直接打开去哪儿
  useEffect(() => {
    if (Platform.OS === 'web') {
      setLoading(false);
      setError('Web端暂不支持自动提取，请点击下方按钮前往去哪儿搜索');
    }
  }, []);

  // JS注入脚本：提取航班数据（简化版，更可靠）
  const extractScript = `
    (function() {
      function sendData(data) {
        window.ReactNativeWebView.postMessage(JSON.stringify(data));
      }

      function tryExtract() {
        // 简化提取逻辑：只找价格和时间
        const priceElements = document.querySelectorAll('[class*="price"], [class*="Price"]');
        const timeElements = document.querySelectorAll('[class*="time"], [class*="Time"]');
        
        const flights = [];
        const prices = Array.from(priceElements).map(el => {
          const match = el.textContent.match(/\\d{2,5}/);
          return match ? parseInt(match[0]) : 0;
        }).filter(p => p > 100 && p < 10000);

        const times = Array.from(timeElements).map(el => {
          const match = el.textContent.match(/\\d{2}:\\d{2}/);
          return match ? match[0] : '';
        }).filter(t => t);

        // 简单配对
        for (let i = 0; i < Math.min(prices.length, Math.floor(times.length / 2)); i++) {
          flights.push({
            platform: 'qunar',
            price: prices[i],
            depTime: times[i * 2] || '',
            arrTime: times[i * 2 + 1] || '',
            airline: '',
            flightNo: '',
            stops: 0,
            duration: ''
          });
        }

        if (flights.length > 0) {
          sendData({ type: 'flights', data: flights });
        } else {
          sendData({ type: 'error', message: '未找到航班数据' });
        }
      }

      setTimeout(tryExtract, 5000);
    })();
    true;
  `;

  const onMessage = (event: any) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'flights') {
        if (msg.data.length > 0) {
          setFlights(msg.data);
          setLoading(false);
          setShowWebView(false);
        } else {
          handleError('未找到航班，请重试');
        }
      } else if (msg.type === 'error') {
        handleError(msg.message);
      }
    } catch (e) {
      handleError('数据解析失败');
    }
  };

  const handleError = (msg: string) => {
    setError(msg);
    setLoading(false);
    if (retryCount < 2) {
      setTimeout(() => {
        setRetryCount(retryCount + 1);
        setLoading(true);
        setError('');
        setShowWebView(true);
      }, 2000);
    }
  };

  const bookFlight = (flight: Flight) => {
    if (Platform.OS === 'web') {
      window.open(qunarUrl, '_blank');
      return;
    }
    
    router.push({
      pathname: '/booking',
      params: {
        url: qunarUrl,
        platform: 'qunar',
        flightNo: flight.flightNo,
      },
    });
  };

  const openQunar = () => {
    if (Platform.OS === 'web') {
      window.open(qunarUrl, '_blank');
    } else {
      router.push({
        pathname: '/booking',
        params: { url: qunarUrl, platform: 'qunar', flightNo: '' },
      });
    }
  };

  const cheapest = flights.length > 0 ? Math.min(...flights.map(f => f.price)) : 0;

  const renderFlight = ({ item }: { item: Flight }) => (
    <View style={s.fCard}>
      <View style={s.fMain}>
        <View style={s.fLeft}>
          {item.airline && <Text style={s.fAirline}>{item.airline} {item.flightNo}</Text>}
          <Text style={s.fTime}>{item.depTime} → {item.arrTime}</Text>
          <Text style={s.fMeta}>{item.stops === 0 ? '直飞' : `${item.stops}次中转`}</Text>
        </View>
        <View style={s.fRight}>
          <Text style={s.fPrice}>¥{item.price}</Text>
          {item.price === cheapest && <Text style={s.fCheap}>最低价</Text>}
        </View>
      </View>
      <TouchableOpacity style={s.bookBtn} onPress={() => bookFlight(item)}>
        <Text style={s.bookBtnText}>立即订票</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={s.safe}>
      {showWebView && Platform.OS !== 'web' && (
        <View style={{ height: 0, overflow: 'hidden' }}>
          <WebView
            ref={webviewRef}
            source={{ uri: qunarUrl }}
            onMessage={onMessage}
            injectedJavaScript={extractScript}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            userAgent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1"
          />
        </View>
      )}

      <View style={s.routeBar}>
        <Text style={s.routeText}>{from} ✈️ {to}  📅 {date}</Text>
        <Text style={s.routeCount}>{flights.length}个航班</Text>
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color="#1a73e8" />
          <Text style={s.loadText}>正在搜索航班...</Text>
          {retryCount > 0 && <Text style={s.retryText}>重试中 ({retryCount}/2)</Text>}
        </View>
      ) : error ? (
        <View style={s.center}>
          <Text style={s.errorText}>❌ {error}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={openQunar}>
            <Text style={s.retryBtnText}>前往去哪儿搜索</Text>
          </TouchableOpacity>
        </View>
      ) : flights.length === 0 ? (
        <View style={s.center}>
          <Text style={s.errorText}>未找到航班</Text>
          <TouchableOpacity style={s.retryBtn} onPress={openQunar}>
            <Text style={s.retryBtnText}>前往去哪儿搜索</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={flights}
          renderItem={renderFlight}
          keyExtractor={(_, i) => String(i)}
          contentContainerStyle={{ padding: 12 }}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f0f2f5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  loadText: { marginTop: 12, color: '#888', fontSize: 15 },
  retryText: { marginTop: 8, color: '#999', fontSize: 13 },
  errorText: { fontSize: 16, color: '#ea4335', textAlign: 'center', marginBottom: 20 },
  retryBtn: { backgroundColor: '#1a73e8', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  retryBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  routeBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, paddingHorizontal: 18, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#f0f0f0' },
  routeText: { fontSize: 15, fontWeight: '600' },
  routeCount: { fontSize: 13, color: '#888' },
  fCard: { backgroundColor: '#fff', borderRadius: 12, marginBottom: 10, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, elevation: 1 },
  fMain: { flexDirection: 'row', alignItems: 'center', padding: 14, paddingHorizontal: 16 },
  fLeft: { flex: 1 },
  fAirline: { fontSize: 12, color: '#999' },
  fTime: { fontSize: 18, fontWeight: '600', marginVertical: 3 },
  fMeta: { fontSize: 11, color: '#aaa' },
  fRight: { alignItems: 'flex-end', marginLeft: 12 },
  fPrice: { fontSize: 22, fontWeight: '700', color: '#ea4335' },
  fCheap: { fontSize: 10, color: '#ea4335', backgroundColor: '#fef0f0', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 3, marginTop: 3 },
  bookBtn: { backgroundColor: '#1a73e8', padding: 12, alignItems: 'center', margin: 10, marginTop: 0, borderRadius: 8 },
  bookBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
