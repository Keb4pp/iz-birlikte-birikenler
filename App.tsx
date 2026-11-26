import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import { createRound, DEMO_QUESTIONS, evaluateGuess, letterCount, scoreAnswer } from './src/engine/wordEngine.js';
import { demoArrowwordEntries, generateArrowword } from './src/engine/crosswordEngine.js';
import { isCloudConfigured, supabase } from './src/lib/supabase';

const C = {
  bg: '#F6F2E9', paper: '#FFFCF5', ink: '#252B28', muted: '#737B73',
  green: '#164B43', green2: '#24665B', gold: '#C88E43', line: '#E6DFD2',
  soft: '#E9EFE9', clue: '#DAD6C9', danger: '#A94336', white: '#FFFFFF',
};
const LOCAL_KEY = 'iz:local-journal:v1';

type Tab = 'journal' | 'word' | 'crossword' | 'together' | 'profile';
type Entry = {
  id: string; title: string; content: string; entry_date: string; visibility: 'shared' | 'personal';
  author_id?: string; author_name?: string; created_at: string;
};
type GameQuestion = ReturnType<typeof createRound>[number];
type GameState = {
  questions: GameQuestion[]; index: number; mainLeft: number; answerLeft: number;
  answering: boolean; guess: string; started: boolean; finished: boolean;
  lastTickAt: number; questionStartedAt: number; score: number;
  correct: number; failed: number; currentStatus: 'pending' | 'correct' | 'failed';
  totalReveals: number;
};

type CrosswordState = ReturnType<typeof generateArrowword>;

function formatDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function Button({ label, onPress, secondary = false, disabled = false }: {
  label: string; onPress: () => void; secondary?: boolean; disabled?: boolean;
}) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [
      styles.button, secondary && styles.buttonSecondary, disabled && styles.buttonDisabled,
      pressed && !disabled && { opacity: 0.82, transform: [{ scale: 0.99 }] },
    ]}>
      <Text style={[styles.buttonText, secondary && styles.buttonTextSecondary]}>{label}</Text>
    </Pressable>
  );
}

function Pill({ children, tone = 'green' }: { children: React.ReactNode; tone?: 'green' | 'gold' | 'gray' }) {
  const bg = tone === 'gold' ? '#F3E8D5' : tone === 'gray' ? '#ECEBE6' : C.soft;
  const color = tone === 'gold' ? '#8A5A21' : tone === 'gray' ? C.muted : C.green;
  return <View style={[styles.pill, { backgroundColor: bg }]}><Text style={[styles.pillText, { color }]}>{children}</Text></View>;
}

function Field({ label, value, onChangeText, placeholder, multiline = false, secureTextEntry = false, keyboardType }: any) {
  return (
    <View style={{ gap: 7 }}>
      {!!label && <Text style={styles.fieldLabel}>{label}</Text>}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9A9D95"
        multiline={multiline}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        textAlignVertical={multiline ? 'top' : 'center'}
        style={[styles.input, multiline && styles.multilineInput]}
        autoCapitalize={keyboardType === 'email-address' ? 'none' : 'sentences'}
      />
    </View>
  );
}

export default function App() {
  const [booting, setBooting] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [tab, setTab] = useState<Tab>('journal');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [spaceId, setSpaceId] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftDate, setDraftDate] = useState(new Date().toISOString().slice(0, 10));
  const [draftContent, setDraftContent] = useState('');
  const [draftVisibility, setDraftVisibility] = useState<'shared' | 'personal'>('shared');
  const [saving, setSaving] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [inviteBusy, setInviteBusy] = useState(false);
  const [game, setGame] = useState<GameState | null>(null);
  const [crossword, setCrossword] = useState<CrosswordState>(null);
  const [activeClue, setActiveClue] = useState<any>(null);
  const [crosswordGuess, setCrosswordGuess] = useState('');
  const [solvedCrossword, setSolvedCrossword] = useState<string[]>([]);
  const [aiStatus, setAiStatus] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isDemo = !isCloudConfigured;
  const userId = session?.user.id ?? 'local-user';

  const refreshEntries = useCallback(async (currentSpaceId?: string | null) => {
    if (isDemo) {
      const raw = await AsyncStorage.getItem(LOCAL_KEY);
      setEntries(raw ? JSON.parse(raw) : []);
      return;
    }
    if (!supabase || !session) return;
    let query = supabase.from('journal_entries')
      .select('id,title,content,entry_date,visibility,author_id,created_at')
      .order('entry_date', { ascending: false }).order('created_at', { ascending: false });
    const { data, error } = await query;
    if (error) {
      Alert.alert('Günlük yüklenemedi', error.message);
      return;
    }
    setEntries((data ?? []) as Entry[]);
  }, [isDemo, session]);

  useEffect(() => {
    if (!isCloudConfigured || !supabase) {
      refreshEntries(null).finally(() => setBooting(false));
      return;
    }
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (alive) {
        setSession(data.session);
        setBooting(false);
      }
    }).catch(() => setBooting(false));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) {
        setSpaceId(null);
        setEntries([]);
      }
    });
    return () => {
      alive = false;
      listener.subscription.unsubscribe();
    };
  }, [refreshEntries]);

  useEffect(() => {
    if (isDemo || !supabase || !session) return;
    let mounted = true;
    (async () => {
      const { data, error } = await supabase.rpc('ensure_shared_space');
      if (error) {
        Alert.alert('Ortak alan açılamadı', `${error.message}\nÖnce Supabase migration dosyasını çalıştırın.`);
        return;
      }
      const id = typeof data === 'string' ? data : data?.space_id;
      if (mounted && id) {
        setSpaceId(id);
        await refreshEntries(id);
      }
    })();
    return () => { mounted = false; };
  }, [isDemo, session, refreshEntries]);

  useEffect(() => {
    if (isDemo || !supabase || !session || !spaceId) return;
    const channel = supabase.channel(`journal-${spaceId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'journal_entries', filter: `space_id=eq.${spaceId}` }, () => {
        refreshEntries(spaceId);
      }).subscribe();
    return () => { supabase?.removeChannel(channel); };
  }, [isDemo, session, spaceId, refreshEntries]);

  useEffect(() => {
    if (!game || game.finished) return;
    timerRef.current = setInterval(() => {
      setGame((current) => {
        if (!current || current.finished) return current;
        const now = Date.now();
        const elapsed = Math.max(0, (now - current.lastTickAt) / 1000);
        const next = { ...current, lastTickAt: now };
        if (current.answering) {
          next.answerLeft = Math.max(0, current.answerLeft - elapsed);
          if (next.answerLeft <= 0) {
            next.answering = false;
            next.currentStatus = 'failed';
            next.failed += 1;
            next.guess = '';
          }
        } else {
          next.mainLeft = Math.max(0, current.mainLeft - elapsed);
          if (next.mainLeft <= 0) next.finished = true;
        }
        return next;
      });
    }, 350);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [game?.started, game?.finished]);

  const startTraining = () => {
    try {
      const questions = createRound();
      setGame({
        questions, index: 0, mainLeft: 240, answerLeft: 30, answering: false,
        guess: '', started: true, finished: false, lastTickAt: Date.now(),
        questionStartedAt: Date.now(), score: 0, correct: 0, failed: 0,
        currentStatus: 'pending', totalReveals: 0,
      });
    } catch (error: any) {
      Alert.alert('Tur başlatılamadı', error.message);
    }
  };

  const saveMemory = async () => {
    if (!draftTitle.trim() || !draftContent.trim()) {
      Alert.alert('Eksik bilgi', 'Anı başlığını ve anlatımını doldur.');
      return;
    }
    setSaving(true);
    try {
      const item: Entry = {
        id: `entry-${Date.now()}`,
        title: draftTitle.trim(), content: draftContent.trim(), entry_date: draftDate,
        visibility: draftVisibility, author_id: userId,
        author_name: isDemo ? 'Sen' : (session?.user.email ?? 'Sen'),
        created_at: new Date().toISOString(),
      };
      if (isDemo) {
        const current = await AsyncStorage.getItem(LOCAL_KEY);
        const all: Entry[] = current ? JSON.parse(current) : [];
        const next = [item, ...all];
        await AsyncStorage.setItem(LOCAL_KEY, JSON.stringify(next));
        setEntries(next);
      } else {
        if (!supabase || !spaceId) throw new Error('Ortak yaşam alanı henüz hazır değil.');
        const { data, error } = await supabase.from('journal_entries').insert({
          space_id: spaceId, author_id: userId, title: item.title, content: item.content,
          entry_date: item.entry_date, visibility: item.visibility,
          ai_share_allowed: item.visibility === 'shared',
        }).select('id,title,content,entry_date,visibility,author_id,created_at').single();
        if (error) throw error;
        setEntries((prev) => [data as Entry, ...prev]);
        if (item.visibility === 'shared') {
          setAiStatus('Anı kaydedildi. Kelime ilişkileri analizi başlatılıyor…');
          supabase.functions.invoke('analyze-entry', { body: { entry_id: data.id } })
            .then(({ error: aiError }) => setAiStatus(aiError ? 'Anı kaydedildi; AI analizi yapılandırma bekliyor.' : 'Anı kaydedildi ve kelime havuzuna işlendi.'))
            .catch(() => setAiStatus('Anı kaydedildi; AI analizi tamamlanamadı.'));
        }
      }
      setDraftTitle(''); setDraftContent(''); setComposerOpen(false);
    } catch (error: any) {
      Alert.alert('Kayıt yapılamadı', error.message ?? 'Beklenmeyen bir hata oluştu.');
    } finally { setSaving(false); }
  };

  const submitAuth = async () => {
    if (!supabase) return;
    if (!authEmail.trim() || authPassword.length < 8) {
      Alert.alert('Giriş bilgileri', 'E-posta gir ve en az 8 karakterli bir parola kullan.');
      return;
    }
    setAuthBusy(true);
    try {
      const response = authMode === 'signup'
        ? await supabase.auth.signUp({ email: authEmail.trim(), password: authPassword })
        : await supabase.auth.signInWithPassword({ email: authEmail.trim(), password: authPassword });
      if (response.error) throw response.error;
      if (authMode === 'signup' && !response.data.session) {
        Alert.alert('E-posta doğrulaması', 'Hesap oluşturuldu. Giriş yapmadan önce e-posta adresini doğrula.');
      }
    } catch (error: any) { Alert.alert('Kimlik doğrulama başarısız', error.message); }
    finally { setAuthBusy(false); }
  };

  const createInvite = async () => {
    if (isDemo) {
      Alert.alert('Demo modu', 'Davet kodu oluşturmak için Supabase projesini bağlamalısın. Demo kayıtları yalnızca bu cihazda tutulur.');
      return;
    }
    if (!supabase) return;
    setInviteBusy(true);
    try {
      const { data, error } = await supabase.rpc('create_space_invite');
      if (error) throw error;
      setInviteCode(String(data));
    } catch (error: any) { Alert.alert('Davet oluşturulamadı', error.message); }
    finally { setInviteBusy(false); }
  };

  const joinInvite = async () => {
    if (!supabase || !inviteCode.trim()) return;
    setInviteBusy(true);
    try {
      const { data, error } = await supabase.rpc('accept_space_invite', { p_code: inviteCode.trim().toUpperCase() });
      if (error) throw error;
      setSpaceId(String(data));
      await refreshEntries(String(data));
      Alert.alert('Birlikte alanı hazır', 'Davet kodu kabul edildi.');
    } catch (error: any) { Alert.alert('Davet kabul edilmedi', error.message); }
    finally { setInviteBusy(false); }
  };

  const doReveal = () => {
    setGame((current) => {
      if (!current || current.finished || current.answering || current.currentStatus !== 'pending') return current;
      const q = current.questions[current.index];
      const available = q.answerLetters.map((_, i) => i).filter((i) => !q.revealed.includes(i));
      if (available.length <= 1) return current;
      const index = available[Math.floor(Math.random() * available.length)];
      const questions = [...current.questions];
      questions[current.index] = { ...q, revealed: [...q.revealed, index] };
      return { ...current, questions, totalReveals: current.totalReveals + 1 };
    });
  };

  const beginAnswer = () => setGame((g) => g ? ({ ...g, answering: true, answerLeft: 30, guess: '', lastTickAt: Date.now() }) : g);

  const submitGuess = () => {
    setGame((current) => {
      if (!current || !current.answering || current.currentStatus !== 'pending') return current;
      const q = current.questions[current.index];
      if (evaluateGuess(current.guess, q.answer)) {
        const elapsed = Math.max(0, (Date.now() - current.questionStartedAt) / 1000);
        const points = scoreAnswer({ answer: q.answer, revealedCount: q.revealed.length, elapsedSeconds: elapsed });
        const questions = [...current.questions];
        questions[current.index] = { ...q, status: 'correct' };
        return { ...current, questions, answering: false, currentStatus: 'correct', score: current.score + points.total, correct: current.correct + 1, guess: '' };
      }
      const attempts = q.attempts + 1;
      const questions = [...current.questions];
      questions[current.index] = { ...q, attempts };
      if (attempts >= 3) {
        questions[current.index] = { ...questions[current.index], status: 'failed' };
        return { ...current, questions, answering: false, currentStatus: 'failed', failed: current.failed + 1, guess: '' };
      }
      return { ...current, questions, guess: '' };
    });
  };

  const nextQuestion = () => {
    setGame((current) => {
      if (!current) return current;
      if (current.index >= current.questions.length - 1) return { ...current, finished: true, answering: false };
      return { ...current, index: current.index + 1, answering: false, answerLeft: 30,
        currentStatus: 'pending', guess: '', lastTickAt: Date.now(), questionStartedAt: Date.now() };
    });
  };

  useEffect(() => {
    if (tab === 'crossword' && !crossword) {
      const result = generateArrowword(demoArrowwordEntries(), 15, 100);
      setCrossword(result);
    }
  }, [tab, crossword]);

  if (booting) return <View style={styles.loading}><ActivityIndicator color={C.green} size="large" /><Text style={styles.muted}>İZ hazırlanıyor…</Text></View>;

  if (isCloudConfigured && !session) {
    return (
      <View style={styles.authPage}>
        <View style={styles.logoMark}><Text style={styles.logoMarkText}>İZ</Text></View>
        <Text style={styles.brandTitle}>Birlikte Birikenler</Text>
        <Text style={styles.authIntro}>Anılarınız, kelimeleriniz ve birlikte oynadığınız oyunlar tek bir yerde.</Text>
        <View style={styles.authCard}>
          <Text style={styles.sectionTitle}>{authMode === 'signin' ? 'Tekrar hoş geldin' : 'Hesabını oluştur'}</Text>
          <Field label="E-posta" value={authEmail} onChangeText={setAuthEmail} placeholder="ornek@email.com" keyboardType="email-address" />
          <Field label="Parola" value={authPassword} onChangeText={setAuthPassword} placeholder="En az 8 karakter" secureTextEntry />
          <Button label={authBusy ? 'İşleniyor…' : authMode === 'signin' ? 'Giriş yap' : 'Hesap oluştur'} onPress={submitAuth} disabled={authBusy} />
          <Pressable onPress={() => setAuthMode(authMode === 'signin' ? 'signup' : 'signin')} style={{ padding: 10 }}>
            <Text style={styles.linkText}>{authMode === 'signin' ? 'Hesabın yok mu? Kayıt ol' : 'Zaten hesabın var mı? Giriş yap'}</Text>
          </Pressable>
        </View>
        <Text style={styles.tinyNote}>Hesabın ve anıların Supabase projenin güvenlik kurallarıyla korunur.</Text>
      </View>
    );
  }

  const currentQuestion = game?.questions[game.index];
  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'journal', label: 'Hikâyemiz', icon: '▤' },
    { key: 'word', label: 'Kelime Oyunu', icon: '⌁' },
    { key: 'crossword', label: 'Çengel', icon: '▦' },
    { key: 'together', label: 'Birlikte', icon: '♡' },
    { key: 'profile', label: 'Profil', icon: '◉' },
  ];

  const renderJournal = () => (
    <ScrollView contentContainerStyle={styles.pageContent}>
      <View style={styles.heroCard}>
        <Text style={styles.eyebrow}>İKİNİZİN HİKÂYESİ</Text>
        <Text style={styles.heroTitle}>Biriktirdiğiniz her an, yeni bir iz bırakır.</Text>
        <Text style={styles.heroBody}>Güzel günleri, küçük ayrıntıları ve yalnızca sizin bildiğiniz hikâyeleri burada saklayın.</Text>
        <View style={styles.heroFooter}>
          <View><Text style={styles.heroMetric}>{entries.length}</Text><Text style={styles.heroMetricLabel}>anı kaydı</Text></View>
          <Button label="＋ Yeni anı ekle" onPress={() => setComposerOpen(true)} />
        </View>
      </View>
      {!!aiStatus && <View style={styles.notice}><Text style={styles.noticeText}>{aiStatus}</Text></View>}
      <View style={styles.sectionHeadingRow}>
        <View><Text style={styles.sectionTitle}>Anı defteriniz</Text><Text style={styles.sectionSub}>Tarihe göre sıralanmış ortak hikâyeler</Text></View>
        <Pill>{entries.length} kayıt</Pill>
      </View>
      {entries.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyIcon}>✦</Text>
          <Text style={styles.emptyTitle}>İlk anınızı ekleyin</Text>
          <Text style={styles.emptyBody}>Birlikte yaşadığınız küçük bir olayı yazın. Bu kayıt, ileride kelime ve soru üretiminin başlangıç noktası olacak.</Text>
          <Button label="İlk anıyı yaz" onPress={() => setComposerOpen(true)} />
        </View>
      ) : entries.map((entry) => (
        <View key={entry.id} style={styles.memoryCard}>
          <View style={styles.memoryMeta}><Text style={styles.memoryDate}>{formatDate(entry.entry_date)}</Text><Pill tone={entry.visibility === 'shared' ? 'green' : 'gray'}>{entry.visibility === 'shared' ? 'Ortak anı' : 'Kişisel'}</Pill></View>
          <Text style={styles.memoryTitle}>{entry.title}</Text>
          <Text style={styles.memoryText}>{entry.content}</Text>
          <View style={styles.memoryFooter}><Text style={styles.memoryAuthor}>{entry.author_name ?? (entry.author_id === userId ? 'Sen' : 'Birlikte')}</Text><Text style={styles.memoryTime}>{new Date(entry.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</Text></View>
        </View>
      ))}
      <Text style={styles.footerHint}>{isDemo ? 'Demo modu: kayıtlar bu cihazda saklanır. İki telefonlu kullanım için Supabase bağlantısı gerekir.' : 'Ortak kayıtlar eşinizin/partnerinizin cihazına gerçek zamanlı senkronize edilir.'}</Text>
    </ScrollView>
  );

  const renderWordGame = () => (
    <ScrollView contentContainerStyle={styles.pageContent}>
      <View style={styles.pageIntro}><Pill tone="gold">KELİME YARIŞMASI</Pill><Text style={styles.pageTitle}>Aklındaki kelimeyi bul.</Text><Text style={styles.pageDescription}>Anılarınızdan ve kelime ilişkilerinden doğan ipuçlarıyla 14 soruluk klasik tur.</Text></View>
      {!game || game.finished ? (
        <>
          {game?.finished && <View style={styles.resultCard}><Text style={styles.eyebrow}>TUR TAMAMLANDI</Text><Text style={styles.resultScore}>{game.score.toLocaleString('tr-TR')} puan</Text><Text style={styles.resultSub}>{game.correct} doğru · {game.failed} pas/yanlış · {game.totalReveals} harf açıldı</Text><Button label="Yeniden oyna" onPress={startTraining} /></View>}
          <View style={styles.gameFeatureCard}>
            <Text style={styles.gameCardKicker}>KLASİK TUR</Text><Text style={styles.gameCardTitle}>14 soru · 240 saniye</Text>
            <Text style={styles.gameCardText}>4 harften 10 harfe uzanan yedi kelime grubunda, her uzunluktan iki soru.</Text>
            <View style={styles.gameFacts}><Pill>Harf başına 100 puan</Pill><Pill tone="gold">Hız bonusu</Pill></View>
            <Button label="Antrenmana başla" onPress={startTraining} />
          </View>
          <View style={styles.lockedCard}><Text style={styles.lockedTitle}>Düello modu</Text><Text style={styles.lockedText}>İki telefondan eş zamanlı yarışma, oyuncu bazlı süre ve sunucu taraflı puanlama sonraki backend aşamasında etkinleştirilecek.</Text><Pill tone="gray">Henüz etkin değil</Pill></View>
          <View style={styles.infoCard}><Text style={styles.infoTitle}>Bu tur nasıl çalışır?</Text><Text style={styles.infoText}>Harf açmak 100 puan düşürür. CEVAPLA ile 30 saniyelik cevap süresine geçersin. En fazla üç tahmin hakkın var. Bu ilk sürümde antrenman cihaz üzerinde çalışır.</Text></View>
        </>
      ) : currentQuestion ? (
        <View style={styles.activeGameCard}>
          <View style={styles.gameTopline}><Pill>SORU {game.index + 1} / 14</Pill><Text style={styles.timerText}>{Math.ceil(game.answering ? game.answerLeft : game.mainLeft)} sn</Text></View>
          <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${((game.index + (game.currentStatus !== 'pending' ? 1 : 0)) / 14) * 100}%` }]} /></View>
          <Text style={styles.questionLength}>{letterCount(currentQuestion.answer)} HARFLİ KELİME</Text>
          <Text style={styles.questionClue}>{currentQuestion.clue}</Text>
          <View style={styles.letterRow}>
            {currentQuestion.answerLetters.map((letter, index) => <View key={`${currentQuestion.id}-${index}`} style={styles.letterTile}><Text style={styles.letterText}>{currentQuestion.revealed.includes(index) ? letter : ' '}</Text></View>)}
          </View>
          <View style={styles.gameActions}>
            <Button label="HARF LÜTFEN" onPress={doReveal} secondary={true} disabled={currentQuestion.revealed.length >= currentQuestion.answerLetters.length - 1 || game.answering || game.currentStatus !== 'pending'} />
            <Button label="CEVAPLA" onPress={beginAnswer} disabled={game.answering || game.currentStatus !== 'pending'} />
          </View>
          <Text style={styles.gameHint}>Açılan harf: {currentQuestion.revealed.length} · Yanlış deneme: {currentQuestion.attempts}/3</Text>
          {game.answering && <View style={styles.answerBox}><Field label="Cevabın" value={game.guess} onChangeText={(guess: string) => setGame((g) => g ? ({ ...g, guess }) : g)} placeholder="Kelimeyi yaz…" /><Button label="Gönder" onPress={submitGuess} disabled={!game.guess.trim()} /><Text style={styles.tinyNote}>Cevap süresi 30 saniye. Ana süre cevaplama sırasında durur.</Text></View>}
          {game.currentStatus === 'correct' && <View style={styles.feedbackGood}><Text style={styles.feedbackTitle}>Doğru cevap!</Text><Text style={styles.feedbackText}>{currentQuestion.answer} · Puanın eklendi.</Text><Button label={game.index === 13 ? 'Sonuçları gör' : 'Sonraki soru'} onPress={nextQuestion} /></View>}
          {game.currentStatus === 'failed' && <View style={styles.feedbackBad}><Text style={styles.feedbackTitle}>Bu sorunun cevabı</Text><Text style={styles.feedbackText}>{currentQuestion.answer}</Text><Button label={game.index === 13 ? 'Sonuçları gör' : 'Sonraki soru'} onPress={nextQuestion} /></View>}
          <View style={styles.gameScoreBar}><Text style={styles.scoreLabel}>TOPLAM PUAN</Text><Text style={styles.scoreValue}>{game.score.toLocaleString('tr-TR')}</Text></View>
        </View>
      ) : null}
    </ScrollView>
  );

  const renderCrossword = () => (
    <ScrollView contentContainerStyle={styles.pageContent}>
      <View style={styles.pageIntro}><Pill tone="gold">GAZETE TADINDA</Pill><Text style={styles.pageTitle}>Çengel bulmaca</Text><Text style={styles.pageDescription}>İpuçları bulmacanın içine yerleşir; cevaplar yatay ve dikey olarak kesişir.</Text></View>
      <View style={styles.crosswordCard}>
        <View style={styles.crosswordHead}><Text style={styles.crosswordDate}>İZ · GÜNLÜK BULMACA</Text><Pill>ÖRNEK</Pill></View>
        {crossword ? (
          <>
            <View style={styles.gridWrap}>
              {crossword.grid.map((row: any[], r: number) => <View key={`r-${r}`} style={styles.gridRow}>
                {row.map((cell, c) => {
                  const entry = cell?.kind === 'clue' ? crossword.entries.find((e: any) => e.id === cell.id) : null;
                  return <Pressable key={`${r}-${c}`} onPress={() => entry && (setActiveClue(entry), setCrosswordGuess(''))} style={[styles.gridCell, cell?.kind === 'letter' && styles.gridLetter, cell?.kind === 'clue' && styles.gridClue, !cell && styles.gridBlank, entry && solvedCrossword.includes(entry.id) && styles.gridSolved]}>
                    <Text style={[styles.gridCellText, cell?.kind === 'clue' && styles.gridClueText]}>{cell?.kind === 'letter' ? cell.char : cell?.kind === 'clue' ? (cell.direction === 'across' ? '→' : '↓') : ''}</Text>
                  </Pressable>;
                })}
              </View>)}
            </View>
            <View style={styles.crosswordStats}><Text style={styles.crosswordStatText}>{solvedCrossword.length} / {crossword.entries.length} cevap</Text><Text style={styles.crosswordStatText}>15 × 15</Text></View>
          </>
        ) : <View style={{ padding: 24, alignItems: 'center' }}><ActivityIndicator color={C.green} /><Text style={styles.muted}>Bulmaca yerleştiriliyor…</Text></View>}
      </View>
      <View style={styles.infoCard}><Text style={styles.infoTitle}>İpuçları</Text>
        {crossword?.entries.map((entry: any) => <Pressable key={entry.id} onPress={() => (setActiveClue(entry), setCrosswordGuess(''))} style={styles.clueListRow}><View style={styles.clueArrow}><Text style={styles.clueArrowText}>{entry.direction === 'across' ? '→' : '↓'}</Text></View><View style={{ flex: 1 }}><Text style={styles.infoText}>{entry.clue}</Text><Text style={styles.clueMeta}>{letterCount(entry.answer)} harf · {entry.direction === 'across' ? 'Yatay' : 'Dikey'}</Text></View><Text style={styles.clueDone}>{solvedCrossword.includes(entry.id) ? '✓' : '›'}</Text></Pressable>)}
      </View>
      <View style={styles.lockedCard}><Text style={styles.lockedTitle}>Ortak çözüm</Text><Text style={styles.lockedText}>Bu sürümde bulmaca tek cihazda çalışan algoritma demosudur. İki telefondan ortak harf senkronizasyonu ve 40–60 cevaplı yayın kalitesinde günlük üretim henüz tamamlanmadı.</Text><Pill tone="gray">Sonraki geliştirme aşaması</Pill></View>
    </ScrollView>
  );

  const renderTogether = () => (
    <ScrollView contentContainerStyle={styles.pageContent}>
      <View style={styles.pageIntro}><Pill>ORTAK YAŞAM ALANI</Pill><Text style={styles.pageTitle}>Birlikte daha güzel.</Text><Text style={styles.pageDescription}>Ortak alanınız, anılarınızın ve oyunlarınızın buluşma noktası.</Text></View>
      <View style={styles.togetherCard}><Text style={styles.togetherIcon}>♡</Text><Text style={styles.gameCardTitle}>İkinizin alanı</Text><Text style={styles.gameCardText}>{isDemo ? 'Şu anda tek cihazlık demo kullanıyorsun. Gerçek davet ve iki telefon senkronizasyonu için bulut bağlantısı kur.' : 'Hesabın bir ortak yaşam alanına bağlı. Davet koduyla ikinci kişiyi ekleyebilirsin.'}</Text><Button label={inviteBusy ? 'Hazırlanıyor…' : 'Davet kodu oluştur'} onPress={createInvite} disabled={inviteBusy || isDemo} />{!!inviteCode && <View style={styles.inviteCode}><Text style={styles.inviteLabel}>DAVET KODUN</Text><Text style={styles.inviteValue}>{inviteCode}</Text></View>}</View>
      <View style={styles.infoCard}><Text style={styles.infoTitle}>Bir davet kodun mu var?</Text><Field label="Davet kodu" value={inviteCode} onChangeText={setInviteCode} placeholder="Örn. IZ-AB12CD" /><Button label="Ortak alana katıl" onPress={joinInvite} secondary disabled={isDemo || inviteBusy || !inviteCode.trim()} /></View>
      <View style={styles.infoCard}><Text style={styles.infoTitle}>Birlikte neler yapabilirsiniz?</Text><Text style={styles.infoText}>• Ortak anı ekleyip okuyabilirsiniz.{ '\n' }• Aynı kelime sorularını çözebilirsiniz.{ '\n' }• Çengel bulmacayı birlikte tamamlayabilirsiniz.{ '\n' }• Oyun ve öğrenme geçmişinizi görebilirsiniz.</Text></View>
    </ScrollView>
  );

  const renderProfile = () => (
    <ScrollView contentContainerStyle={styles.pageContent}>
      <View style={styles.pageIntro}><Pill>HESABIN</Pill><Text style={styles.pageTitle}>Profil ve ayarlar</Text><Text style={styles.pageDescription}>İZ deneyimini ve gizlilik tercihlerini yönet.</Text></View>
      <View style={styles.profileCard}><View style={styles.avatar}><Text style={styles.avatarText}>{isDemo ? 'İ' : (session?.user.email?.[0] ?? 'İ').toLocaleUpperCase('tr-TR')}</Text></View><Text style={styles.profileName}>{isDemo ? 'Demo kullanıcı' : session?.user.email}</Text><Text style={styles.muted}>{isDemo ? 'Bu cihazda yerel kayıt' : 'Supabase hesabı'}</Text></View>
      <View style={styles.infoCard}><Text style={styles.infoTitle}>Gizlilik ilkeleri</Text><Text style={styles.infoText}>Kişisel işaretlenen anılar ortak oyun üretimine gönderilmez. AI analizi yalnızca ortak olarak işaretlenmiş ve AI kullanımına izin verilmiş kayıtlar için sunucu tarafında yapılır. OpenAI anahtarı uygulamanın içine konulmaz.</Text></View>
      <View style={styles.infoCard}><Text style={styles.infoTitle}>Uygulama bilgisi</Text><Text style={styles.infoText}>İZ · Birlikte Birikenler{ '\n' }Sürüm 0.1.0 · {isDemo ? 'Yerel demo modu' : 'Bulut bağlantısı açık'}</Text></View>
      {!isDemo && <Button label="Güvenli çıkış yap" secondary onPress={() => supabase?.auth.signOut()} />}
      {isDemo && <Button label="Demo anılarını temizle" secondary onPress={() => Alert.alert('Kayıtları temizle', 'Bu cihazdaki demo günlük kayıtları silinsin mi?', [{ text: 'Vazgeç', style: 'cancel' }, { text: 'Sil', style: 'destructive', onPress: async () => { await AsyncStorage.removeItem(LOCAL_KEY); setEntries([]); } }])} />}
    </ScrollView>
  );

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />
      <View style={styles.topBar}><View style={styles.brandRow}><View style={styles.smallLogo}><Text style={styles.smallLogoText}>İZ</Text></View><View><Text style={styles.brandTitleSmall}>Birlikte Birikenler</Text><Text style={styles.brandSub}>HİKÂYENİZİN OYUNLAŞMIŞ HÂLİ</Text></View></View><Pill tone={isDemo ? 'gold' : 'green'}>{isDemo ? 'DEMO' : 'CANLI'}</Pill></View>
      <View style={{ flex: 1 }}>
        {tab === 'journal' && renderJournal()}
        {tab === 'word' && renderWordGame()}
        {tab === 'crossword' && renderCrossword()}
        {tab === 'together' && renderTogether()}
        {tab === 'profile' && renderProfile()}
      </View>
      <View style={styles.tabBar}>{tabs.map((item) => <Pressable key={item.key} onPress={() => setTab(item.key)} style={styles.tabItem}><Text style={[styles.tabIcon, tab === item.key && styles.tabIconActive]}>{item.icon}</Text><Text style={[styles.tabLabel, tab === item.key && styles.tabLabelActive]}>{item.label}</Text><View style={[styles.tabDot, tab === item.key && styles.tabDotActive]} /></Pressable>)}</View>

      <Modal visible={composerOpen} animationType="slide" transparent onRequestClose={() => setComposerOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalShade}>
          <View style={styles.modalCard}>
            <View style={styles.modalGrabber} /><View style={styles.modalHeading}><View><Text style={styles.eyebrow}>YENİ BİR İZ</Text><Text style={styles.sectionTitle}>Anını kaydet</Text></View><Pressable onPress={() => setComposerOpen(false)}><Text style={styles.closeIcon}>×</Text></Pressable></View>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 14, paddingBottom: 6 }}>
              <Field label="Başlık" value={draftTitle} onChangeText={setDraftTitle} placeholder="Örn. İlk at binme deneyimimiz" />
              <Field label="Tarih (YYYY-AA-GG)" value={draftDate} onChangeText={setDraftDate} placeholder="2026-11-26" />
              <Field label="O gün neler oldu?" value={draftContent} onChangeText={setDraftContent} placeholder="Aklında kalanları kendi kelimelerinle anlat…" multiline />
              <Text style={styles.fieldLabel}>Görünürlük</Text>
              <View style={styles.visibilityRow}><Pressable onPress={() => setDraftVisibility('shared')} style={[styles.visibilityOption, draftVisibility === 'shared' && styles.visibilitySelected]}><Text style={[styles.visibilityText, draftVisibility === 'shared' && styles.visibilityTextSelected]}>♡ Ortak anı</Text></Pressable><Pressable onPress={() => setDraftVisibility('personal')} style={[styles.visibilityOption, draftVisibility === 'personal' && styles.visibilitySelected]}><Text style={[styles.visibilityText, draftVisibility === 'personal' && styles.visibilityTextSelected]}>◉ Kişisel</Text></Pressable></View>
              <Text style={styles.tinyNote}>Kişisel kayıtlar ortak oyun üretimine katılmaz. Fotoğraf ve konum ekleme sonraki sürümde eklenecek.</Text>
              <Button label={saving ? 'Kaydediliyor…' : 'Anıyı kaydet'} onPress={saveMemory} disabled={saving} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={!!activeClue} animationType="fade" transparent onRequestClose={() => setActiveClue(null)}>
        <View style={styles.modalShade}><View style={styles.clueModal}><Text style={styles.eyebrow}>ÇENGEL İPUCU · {activeClue?.direction === 'across' ? 'YATAY →' : 'DİKEY ↓'}</Text><Text style={styles.clueQuestion}>{activeClue?.clue}</Text><Text style={styles.tinyNote}>{activeClue ? letterCount(activeClue.answer) : 0} harf</Text><Field label="Cevabın" value={crosswordGuess} onChangeText={setCrosswordGuess} placeholder="Cevabı yaz…" /><Button label="Kontrol et" onPress={() => {
          if (activeClue && evaluateGuess(crosswordGuess, activeClue.answer)) {
            setSolvedCrossword((prev) => prev.includes(activeClue.id) ? prev : [...prev, activeClue.id]);
            setActiveClue(null); setCrosswordGuess('');
          } else Alert.alert('Bir daha düşün', 'Bu cevap eşleşmedi. Harfleri ve yönü yeniden kontrol et.');
        }} disabled={!crosswordGuess.trim()} /><Button label="Kapat" onPress={() => setActiveClue(null)} secondary /></View></View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg }, loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg, gap: 12 },
  topBar: { paddingHorizontal: 19, paddingTop: Platform.OS === 'ios' ? 10 : 18, paddingBottom: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: C.line, backgroundColor: C.bg },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 }, smallLogo: { width: 38, height: 38, borderRadius: 13, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center' }, smallLogoText: { color: C.white, fontSize: 16, fontWeight: '900', letterSpacing: -1 },
  brandTitleSmall: { color: C.ink, fontSize: 15, fontWeight: '800' }, brandSub: { color: C.muted, fontSize: 8, marginTop: 2, letterSpacing: 1.05, fontWeight: '700' },
  pageContent: { padding: 18, paddingBottom: 30, gap: 15 }, heroCard: { backgroundColor: C.green, borderRadius: 23, padding: 21, gap: 12 }, eyebrow: { color: '#D7C49E', letterSpacing: 1.8, fontSize: 9, fontWeight: '900' }, heroTitle: { color: C.white, fontSize: 25, lineHeight: 31, fontWeight: '800', maxWidth: 300 }, heroBody: { color: '#E4EDE8', fontSize: 13, lineHeight: 19 }, heroFooter: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 5 }, heroMetric: { color: C.white, fontSize: 26, fontWeight: '800' }, heroMetricLabel: { color: '#D2DFD8', fontSize: 11 },
  button: { backgroundColor: C.gold, paddingVertical: 13, paddingHorizontal: 17, borderRadius: 14, alignItems: 'center', justifyContent: 'center', minHeight: 46 }, buttonSecondary: { backgroundColor: C.soft, borderWidth: 1, borderColor: '#D7E1D8' }, buttonDisabled: { opacity: 0.45 }, buttonText: { color: '#2C261E', fontSize: 13, fontWeight: '800' }, buttonTextSecondary: { color: C.green },
  pill: { alignSelf: 'flex-start', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 5 }, pillText: { fontSize: 9, fontWeight: '900', letterSpacing: 0.8 }, notice: { backgroundColor: '#F0E8D7', borderRadius: 12, padding: 11 }, noticeText: { color: '#76552E', fontSize: 11, lineHeight: 16 },
  sectionHeadingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 5 }, sectionTitle: { color: C.ink, fontSize: 19, fontWeight: '800' }, sectionSub: { color: C.muted, fontSize: 11, marginTop: 3 }, emptyCard: { borderRadius: 20, borderWidth: 1, borderColor: C.line, backgroundColor: C.paper, padding: 22, alignItems: 'center', gap: 11 }, emptyIcon: { color: C.gold, fontSize: 32 }, emptyTitle: { color: C.ink, fontWeight: '800', fontSize: 17 }, emptyBody: { textAlign: 'center', color: C.muted, fontSize: 12, lineHeight: 18, maxWidth: 290 },
  memoryCard: { backgroundColor: C.paper, borderWidth: 1, borderColor: C.line, borderRadius: 18, padding: 16, gap: 9 }, memoryMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, memoryDate: { color: C.muted, fontSize: 10, fontWeight: '700' }, memoryTitle: { color: C.ink, fontWeight: '800', fontSize: 17 }, memoryText: { color: '#4F5852', fontSize: 13, lineHeight: 20 }, memoryFooter: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderColor: '#EFE9DE', paddingTop: 9, marginTop: 2 }, memoryAuthor: { color: C.green, fontSize: 10, fontWeight: '800' }, memoryTime: { color: C.muted, fontSize: 10 }, footerHint: { color: C.muted, fontSize: 10, lineHeight: 15, textAlign: 'center', marginTop: 5 },
  pageIntro: { gap: 8, marginBottom: 2 }, pageTitle: { color: C.ink, fontSize: 27, fontWeight: '900', letterSpacing: -0.7 }, pageDescription: { color: C.muted, fontSize: 13, lineHeight: 19 }, gameFeatureCard: { backgroundColor: C.paper, borderRadius: 22, borderWidth: 1, borderColor: C.line, padding: 19, gap: 12 }, gameCardKicker: { color: C.gold, fontSize: 9, fontWeight: '900', letterSpacing: 1.5 }, gameCardTitle: { color: C.ink, fontSize: 21, fontWeight: '850' }, gameCardText: { color: C.muted, fontSize: 12, lineHeight: 18 }, gameFacts: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' }, lockedCard: { backgroundColor: '#F0EEE8', borderRadius: 18, borderWidth: 1, borderColor: C.line, padding: 16, gap: 8 }, lockedTitle: { color: C.ink, fontSize: 15, fontWeight: '800' }, lockedText: { color: C.muted, fontSize: 11, lineHeight: 17 }, infoCard: { backgroundColor: C.paper, borderRadius: 18, borderWidth: 1, borderColor: C.line, padding: 16, gap: 9 }, infoTitle: { color: C.ink, fontWeight: '800', fontSize: 14 }, infoText: { color: C.muted, fontSize: 12, lineHeight: 18 },
  activeGameCard: { backgroundColor: C.paper, borderRadius: 22, borderWidth: 1, borderColor: C.line, padding: 17, gap: 15 }, gameTopline: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, timerText: { color: C.green, fontSize: 18, fontWeight: '900', fontVariant: ['tabular-nums'] }, progressTrack: { height: 5, backgroundColor: '#E8E2D7', borderRadius: 10, overflow: 'hidden' }, progressFill: { backgroundColor: C.gold, height: 5, borderRadius: 10 }, questionLength: { color: C.gold, fontSize: 9, fontWeight: '900', letterSpacing: 1.5, textAlign: 'center' }, questionClue: { color: C.ink, fontSize: 20, lineHeight: 28, fontWeight: '700', textAlign: 'center', paddingHorizontal: 3, minHeight: 83, textAlignVertical: 'center' }, letterRow: { flexDirection: 'row', gap: 5, justifyContent: 'center', flexWrap: 'wrap' }, letterTile: { width: 31, height: 39, borderBottomWidth: 3, borderBottomColor: C.green, backgroundColor: '#F2EEE5', alignItems: 'center', justifyContent: 'center', borderRadius: 5 }, letterText: { color: C.green, fontWeight: '900', fontSize: 20 }, gameActions: { flexDirection: 'row', gap: 9 }, gameActions: { flexDirection: 'row', gap: 9 }, gameHint: { textAlign: 'center', color: C.muted, fontSize: 10 }, answerBox: { borderTopWidth: 1, borderColor: C.line, paddingTop: 12, gap: 10 }, feedbackGood: { backgroundColor: '#E7F0E9', borderRadius: 13, padding: 13, gap: 6 }, feedbackBad: { backgroundColor: '#F5E8E4', borderRadius: 13, padding: 13, gap: 6 }, feedbackTitle: { fontWeight: '900', color: C.green, fontSize: 14 }, feedbackText: { color: C.ink, fontSize: 13 }, gameScoreBar: { borderTopWidth: 1, borderColor: C.line, paddingTop: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, scoreLabel: { color: C.muted, fontSize: 9, fontWeight: '900', letterSpacing: 1.2 }, scoreValue: { color: C.green, fontSize: 21, fontWeight: '900' }, resultCard: { backgroundColor: C.green, borderRadius: 22, padding: 18, gap: 8 }, resultScore: { color: C.white, fontSize: 30, fontWeight: '900' }, resultSub: { color: '#E2EAE5', fontSize: 11, marginBottom: 4 },
  crosswordCard: { backgroundColor: '#EAE6DC', borderRadius: 16, padding: 10, borderWidth: 1, borderColor: '#D7D0C2' }, crosswordHead: { flexDirection: 'row', justifyContent: 'space-between', padding: 6, alignItems: 'center' }, crosswordDate: { color: C.ink, fontSize: 10, fontWeight: '900', letterSpacing: 1.2 }, gridWrap: { backgroundColor: '#434A45', padding: 2, borderRadius: 4, aspectRatio: 1, gap: 1 }, gridRow: { flex: 1, flexDirection: 'row', gap: 1 }, gridCell: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 1 }, gridLetter: { backgroundColor: '#FFFEF9' }, gridClue: { backgroundColor: '#D2C6AE', borderWidth: 0.5, borderColor: '#A89C85' }, gridBlank: { backgroundColor: '#4D544F' }, gridSolved: { backgroundColor: '#D6E8DC' }, gridCellText: { color: C.ink, fontSize: 9, fontWeight: '900' }, gridClueText: { color: C.green, fontSize: 12 }, crosswordStats: { flexDirection: 'row', justifyContent: 'space-between', padding: 7 }, crosswordStatText: { color: C.muted, fontSize: 10, fontWeight: '700' }, clueListRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderColor: '#F0EAE0' }, clueArrow: { width: 27, height: 27, borderRadius: 7, backgroundColor: C.soft, alignItems: 'center', justifyContent: 'center' }, clueArrowText: { color: C.green, fontSize: 15, fontWeight: '900' }, clueMeta: { color: C.muted, fontSize: 9, marginTop: 3 }, clueDone: { color: C.green, fontSize: 18, fontWeight: '900' },
  togetherCard: { backgroundColor: C.green, borderRadius: 22, padding: 20, gap: 12 }, togetherIcon: { color: C.gold, fontSize: 30 }, inviteCode: { backgroundColor: '#0F3E37', borderRadius: 13, padding: 13, alignItems: 'center', gap: 5 }, inviteLabel: { color: '#B9C9C1', fontSize: 8, fontWeight: '900', letterSpacing: 1.4 }, inviteValue: { color: C.white, fontSize: 23, fontWeight: '900', letterSpacing: 3 },
  profileCard: { alignItems: 'center', padding: 22, backgroundColor: C.paper, borderRadius: 18, borderWidth: 1, borderColor: C.line, gap: 7 }, avatar: { width: 64, height: 64, borderRadius: 22, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center', marginBottom: 3 }, avatarText: { color: C.white, fontSize: 25, fontWeight: '900' }, profileName: { color: C.ink, fontWeight: '800', fontSize: 15 }, muted: { color: C.muted, fontSize: 11 },
  tabBar: { height: 68, borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.paper, flexDirection: 'row', paddingHorizontal: 5, paddingTop: 8, paddingBottom: Platform.OS === 'ios' ? 9 : 6 }, tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 }, tabIcon: { color: '#91968F', fontSize: 18, height: 22 }, tabIconActive: { color: C.green, fontWeight: '900' }, tabLabel: { color: '#8B9089', fontSize: 8, fontWeight: '700' }, tabLabelActive: { color: C.green, fontWeight: '900' }, tabDot: { width: 4, height: 4, borderRadius: 5, backgroundColor: 'transparent' }, tabDotActive: { backgroundColor: C.gold },
  modalShade: { flex: 1, backgroundColor: 'rgba(22,35,30,0.42)', justifyContent: 'flex-end' }, modalCard: { backgroundColor: C.bg, borderTopLeftRadius: 25, borderTopRightRadius: 25, padding: 20, paddingBottom: Platform.OS === 'ios' ? 34 : 20, maxHeight: '92%', gap: 12 }, modalGrabber: { width: 42, height: 4, backgroundColor: '#C8C6BC', borderRadius: 4, alignSelf: 'center', marginBottom: 2 }, modalHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, closeIcon: { color: C.muted, fontSize: 28, paddingHorizontal: 6 }, fieldLabel: { color: C.ink, fontSize: 11, fontWeight: '800' }, input: { backgroundColor: C.paper, borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 12, color: C.ink, fontSize: 13, minHeight: 46 }, multilineInput: { minHeight: 145, paddingTop: 12 }, visibilityRow: { flexDirection: 'row', gap: 8 }, visibilityOption: { flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center', backgroundColor: C.paper, borderWidth: 1, borderColor: C.line }, visibilitySelected: { backgroundColor: C.soft, borderColor: C.green }, visibilityText: { color: C.muted, fontSize: 12, fontWeight: '800' }, visibilityTextSelected: { color: C.green }, tinyNote: { color: C.muted, fontSize: 10, lineHeight: 15 }, clueModal: { backgroundColor: C.bg, margin: 20, borderRadius: 22, padding: 20, gap: 13 }, clueQuestion: { color: C.ink, fontSize: 20, lineHeight: 28, fontWeight: '800' },
  authPage: { flex: 1, backgroundColor: C.bg, padding: 25, justifyContent: 'center', gap: 10 }, logoMark: { width: 62, height: 62, borderRadius: 22, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 4 }, logoMarkText: { color: C.white, fontSize: 27, fontWeight: '900' }, brandTitle: { color: C.ink, fontSize: 27, fontWeight: '900', textAlign: 'center' }, authIntro: { color: C.muted, textAlign: 'center', fontSize: 13, lineHeight: 19, marginBottom: 14, paddingHorizontal: 12 }, authCard: { backgroundColor: C.paper, borderWidth: 1, borderColor: C.line, borderRadius: 22, padding: 19, gap: 14 }, linkText: { color: C.green, fontSize: 12, fontWeight: '800', textAlign: 'center' }
});
