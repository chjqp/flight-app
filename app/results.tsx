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

interface PlatformStatus {
  status: 'searching' | 'found' | 'notfound' | 'error';
  count: number;
}

export default function ResultsScreen() {
  const { from, to, date } = useLocalSearchParams<{ from: string; to: string; date: string }>();
  const [flights, setFlights] = useState<Flight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showWebView, setShowWebView] = useState(Platform.OS !== 'web');
  const qunarRef = useRef<WebView>(null);
  const ctripRef = useRef<WebView>(null);
  const fliggyRef = useRef<WebView>(null);
  
  const [platformStatus, setPlatformStatus] = useState<Record<string, PlatformStatus>>({
    qunar: { status: 'searching', count: 0 },
    // ctrip: { status: 'searching', count: 0 }, // 暂时禁用，需要专门适配
    // fliggy: { status: 'searching', count: 0 }, // 暂时禁用，证书问题
  });
  
  const [completedPlatforms, setCompletedPlatforms] = useState(new Set<string>());

  // 城市代码映射（携程用）
  const ctripCityCode: Record<string, string> = {
    '北京': 'BJS', '上海': 'SHA', '广州': 'CAN', '深圳': 'SZX', '成都': 'CTU',
    '昆明': 'KMG', '杭州': 'HGH', '西安': 'SIA', '重庆': 'CKG', '武汉': 'WUH',
    '南京': 'NKG', '长沙': 'CSX', '厦门': 'XMN', '青岛': 'TAO', '大连': 'DLC',
    '三亚': 'SYX', '海口': 'HAK', '哈尔滨': 'HRB', '沈阳': 'SHE', '天津': 'TSN',
    '郑州': 'CGO', '贵阳': 'KWE',
  };

  // 去哪儿搜索URL
  const qunarUrl = `https://m.flight.qunar.com/ncs/page/flightlist?depCity=${encodeURIComponent(from!)}&arrCity=${encodeURIComponent(to!)}&goDate=${date}`;
  
  // 携程搜索URL
  const getCtripUrl = () => {
    const fromCode = ctripCityCode[from!];
    const toCode = ctripCityCode[to!];
    if (!fromCode || !toCode) return null;
    return `https://m.ctrip.com/html5/flight/swift/domestic/${fromCode}-${toCode}/${date}`;
  };
  
  // 飞猪搜索URL
  const fliggyUrl = `https://h5.m.goofly.com/fliggy-offline/index.html#/flight/list?depCityName=${encodeURIComponent(from!)}&arrCityName=${encodeURIComponent(to!)}&depDate=${date}`;

  const ctripUrl = getCtripUrl();

  // Web端fallback：直接打开去哪儿
  useEffect(() => {
    if (Platform.OS === 'web') {
      setLoading(false);
      setError('Web端暂不支持自动提取，请点击下方按钮前往去哪儿搜索');
    }
  }, []);

  // 基于内容特征的提取脚本
  const getExtractScript = (platform: string) => `
    (function() {
      const platform = '${platform}';
      let retryAttempts = 0;
      const maxRetries = 20;
      
      function sendData(data) {
        try {
          window.ReactNativeWebView.postMessage(JSON.stringify(data));
        } catch(e) {
          console.log('postMessage error:', e);
        }
      }
      
      function sendProgress(attempt) {
        sendData({ type: 'progress', platform: platform, attempt: attempt, max: maxRetries });
      }
      
      function sendDebug(msg) {
        sendData({ type: 'debug', platform: platform, message: msg });
      }

      function tryExtract() {
        retryAttempts++;
        sendProgress(retryAttempts);
        
        sendDebug('开始提取，尝试 ' + retryAttempts + '/' + maxRetries);
        
        const flights = [];
        const seen = new Set();
        
        // 遍历所有可能的航班卡片容器
        const containers = document.querySelectorAll('div, li, section, article');
        sendDebug('找到 ' + containers.length + ' 个容器元素');
        
        let priceCount = 0;
        let timeCount = 0;
        
        for (let i = 0; i < containers.length; i++) {
          const container = containers[i];
          const text = container.innerText || container.textContent || '';
          
          // 跳过太长或太短的元素
          if (text.length < 20 || text.length > 500) continue;
          
          // 查找价格（¥数字格式，或纯数字）
          const priceMatch = text.match(/¥\\s*(\\d{2,5})|价格[：:]*\\s*(\\d{2,5})|^\\s*(\\d{3,5})\\s*$/m);
          if (!priceMatch) continue;
          
          priceCount++;
          const price = parseInt(priceMatch[1] || priceMatch[2] || priceMatch[3]);
          if (price < 100 || price > 10000) continue;
          
          // 查找时间（支持多种格式：xx:xx、x:xx、xx时xx分）
          const timeMatches = text.match(/\\d{1,2}:\\d{2}|\\d{1,2}时\\d{2}分/g);
          if (!timeMatches || timeMatches.length < 2) continue;
          
          timeCount++;
          const depTime = timeMatches[0];
          const arrTime = timeMatches[1];
          
          // 去重：使用价格+时间作为唯一标识
          const key = price + '-' + depTime + '-' + arrTime;
          if (seen.has(key)) continue;
          seen.add(key);
          
          // 提取航司名
          let airline = '';
          const airlinePatterns = ['国航', '东航', '南航', '海航', '川航', '春秋', '吉祥', '厦航', '山航', '深航', '昆航', '祥鹏', '瑞丽'];
          for (let j = 0; j < airlinePatterns.length; j++) {
            if (text.includes(airlinePatterns[j])) {
              airline = airlinePatterns[j];
              break;
            }
          }
          
          // 提取航班号（XX1234格式）
          const flightNoMatch = text.match(/[A-Z]{2}\\d{3,4}/);
          const flightNo = flightNoMatch ? flightNoMatch[0] : '';
          
          // 判断是否中转
          const stops = text.includes('中转') || text.includes('经停') ? 1 : 0;
          
          flights.push({
            platform: platform,
            price: price,
            flightNo: flightNo,
            airline: airline,
            depTime: depTime,
            arrTime: arrTime,
            duration: '',
            stops: stops
          });
        }
        
        sendDebug('找到 ' + priceCount + ' 个价格，' + timeCount + ' 个时间对');
        
        // 去重并排序
        const uniqueFlights = [];
        const flightKeys = new Set();
        for (let i = 0; i < flights.length; i++) {
          const f = flights[i];
          const key = f.price + '-' + f.depTime + '-' + f.arrTime;
          if (!flightKeys.has(key)) {
            flightKeys.add(key);
            uniqueFlights.push(f);
          }
        }
        
        // 按价格排序
        uniqueFlights.sort(function(a, b) { return a.price - b.price; });
        
        sendDebug('提取到 ' + uniqueFlights.length + ' 个唯一航班');
        
        if (uniqueFlights.length > 0) {
          sendData({ type: 'flights', platform: platform, data: uniqueFlights });
        } else if (retryAttempts >= maxRetries) {
          sendDebug('达到最大重试次数，未找到航班');
          sendData({ type: 'notfound', platform: platform });
        }
        
        return uniqueFlights.length;
      }

      const timer = setInterval(function() {
        const found = tryExtract();
        if (found > 0 || retryAttempts >= maxRetries) {
          clearInterval(timer);
        }
      }, 2000);
      
      sendProgress(0);
      sendDebug('提取脚本已启动');
    })();
    true;
  `;

  const onMessage = (event: any) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      
      if (msg.type === 'debug') {
        // 调试信息，打印到控制台
        console.log(`[${msg.platform}] ${msg.message}`);
        
      } else if (msg.type === 'flights') {
        // 收到航班数据
        console.log(`[${msg.platform}] 找到 ${msg.data.length} 个航班`);
        setFlights(prev => {
          const newFlights = [...prev, ...msg.data];
          // 按价格排序
          newFlights.sort((a, b) => a.price - b.price);
          return newFlights;
        });
        
        setPlatformStatus(prev => ({
          ...prev,
          [msg.platform]: { status: 'found', count: msg.data.length }
        }));
        
        setCompletedPlatforms(prev => new Set(prev).add(msg.platform));
        
      } else if (msg.type === 'notfound') {
        console.log(`[${msg.platform}] 未找到航班`);
        setPlatformStatus(prev => ({
          ...prev,
          [msg.platform]: { status: 'notfound', count: 0 }
        }));
        
        setCompletedPlatforms(prev => new Set(prev).add(msg.platform));
        
      } else if (msg.type === 'progress') {
        // 更新搜索进度
        console.log(`[${msg.platform}] 进度: ${msg.attempt}/${msg.max}`);
        setPlatformStatus(prev => ({
          ...prev,
          [msg.platform]: { ...prev[msg.platform], status: 'searching' }
        }));
      }
    } catch (e) {
      console.error('Parse error:', e);
    }
  };

  // 检查是否所有平台都完成了
  useEffect(() => {
    const totalPlatforms = 1; // 只有去哪儿
    
    if (completedPlatforms.size >= totalPlatforms) {
      setLoading(false);
      setShowWebView(false);
      
      if (flights.length === 0) {
        setError('未找到航班');
      }
    }
  }, [completedPlatforms, flights]);

  const bookFlight = (flight: Flight) => {
    if (Platform.OS === 'web') {
      window.open(qunarUrl, '_blank');
      return;
    }
    
    let url = qunarUrl;
    
    // 根据平台构造URL
    if (flight.platform === 'qunar') {
      url = `https://m.flight.qunar.com/ncs/page/flightlist?depCity=${encodeURIComponent(from!)}&arrCity=${encodeURIComponent(to!)}&goDate=${date}`;
    } else if (flight.platform === 'ctrip') {
      const fromCode = ctripCityCode[from!];
      const toCode = ctripCityCode[to!];
      if (fromCode && toCode) {
        url = `https://m.ctrip.com/html5/flight/swift/domestic/${fromCode}-${toCode}/${date}`;
      }
    } else if (flight.platform === 'fliggy') {
      url = `https://h5.m.goofly.com/fliggy-offline/index.html#/flight/list?depCityName=${encodeURIComponent(from!)}&arrCityName=${encodeURIComponent(to!)}&depDate=${date}`;
    }
    
    router.push({
      pathname: '/booking',
      params: {
        url: url,
        platform: flight.platform,
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

  const getPlatformColor = (platform: string) => {
    if (platform === 'qunar') return '#FFB90F';
    if (platform === 'ctrip') return '#0086F6';
    if (platform === 'fliggy') return '#9C27B0';
    return '#999';
  };

  const getPlatformName = (platform: string) => {
    if (platform === 'qunar') return '去哪儿';
    if (platform === 'ctrip') return '携程';
    if (platform === 'fliggy') return '飞猪';
    return platform;
  };

  const renderFlight = ({ item }: { item: Flight }) => (
    <View style={s.fCard}>
      <View style={s.fMain}>
        <View style={s.fLeft}>
          <View style={s.fTopRow}>
            {item.airline && <Text style={s.fAirline}>{item.airline} {item.flightNo}</Text>}
            <View style={[s.platformBadge, { backgroundColor: getPlatformColor(item.platform) }]}>
              <Text style={s.platformBadgeText}>{getPlatformName(item.platform)}</Text>
            </View>
          </View>
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

  const renderPlatformStatus = () => {
    const platforms = [
      { key: 'qunar', name: '去哪儿', icon: '🟡' },
      // { key: 'ctrip', name: '携程', icon: '🔵', skip: !ctripUrl },
      // { key: 'fliggy', name: '飞猪', icon: '🟣' },
    ];

    return (
      <View style={s.platformStatusContainer}>
        <Text style={s.platformStatusTitle}>正在搜索去哪儿...</Text>
        {platforms.map(p => {
          if (p.skip) return null;
          const status = platformStatus[p.key];
          let statusText = '搜索中...';
          if (status.status === 'found') statusText = `找到${status.count}个 ✓`;
          if (status.status === 'notfound') statusText = '未找到 ✗';
          if (status.status === 'error') statusText = '加载失败 ✗';
          
          return (
            <Text key={p.key} style={s.platformStatusRow}>
              {p.icon} {p.name}: {statusText}
            </Text>
          );
        })}
        <Text style={s.platformTip}>💡 携程和飞猪正在适配中...</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={s.safe}>
      {showWebView && Platform.OS !== 'web' && (
        <View style={{ height: 0, overflow: 'hidden' }}>
          <WebView
            ref={qunarRef}
            source={{ uri: qunarUrl }}
            onMessage={onMessage}
            injectedJavaScript={getExtractScript('qunar')}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            userAgent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1"
          />
          {/* 携程和飞猪暂时禁用，需要专门适配 */}
        </View>
      )}

      <View style={s.routeBar}>
        <Text style={s.routeText}>{from} ✈️ {to}  📅 {date}</Text>
        <Text style={s.routeCount}>{flights.length}个航班</Text>
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color="#1a73e8" />
          {renderPlatformStatus()}
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
  fTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  fAirline: { fontSize: 12, color: '#999' },
  platformBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  platformBadgeText: { fontSize: 10, color: '#fff', fontWeight: '600' },
  fTime: { fontSize: 18, fontWeight: '600', marginVertical: 3 },
  fMeta: { fontSize: 11, color: '#aaa' },
  fRight: { alignItems: 'flex-end', marginLeft: 12 },
  fPrice: { fontSize: 22, fontWeight: '700', color: '#ea4335' },
  fCheap: { fontSize: 10, color: '#ea4335', backgroundColor: '#fef0f0', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 3, marginTop: 3 },
  bookBtn: { backgroundColor: '#1a73e8', padding: 12, alignItems: 'center', margin: 10, marginTop: 0, borderRadius: 8 },
  bookBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  platformStatusContainer: { marginTop: 20, backgroundColor: '#fff', borderRadius: 12, padding: 16, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  platformStatusTitle: { fontSize: 15, fontWeight: '600', marginBottom: 12, textAlign: 'center' },
  platformStatusRow: { fontSize: 14, color: '#666', marginVertical: 4 },
  platformTip: { fontSize: 12, color: '#999', marginTop: 8, textAlign: 'center' },
});
