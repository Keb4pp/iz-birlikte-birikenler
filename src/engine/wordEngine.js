/** Turkish-aware helpers used by the training mode. */
export function normalizeAnswer(value) {
  return Array.from(String(value ?? '').toLocaleUpperCase('tr-TR'))
    .filter((char) => /[A-ZÇĞİÖŞÜ]/u.test(char))
    .join('');
}

export function letterCount(value) {
  return Array.from(normalizeAnswer(value)).length;
}

export function scoreAnswer({ answer, revealedCount = 0, elapsedSeconds = 0 }) {
  const length = letterCount(answer);
  const safeRevealed = Math.max(0, Math.min(revealedCount, Math.max(0, length - 1)));
  const base = Math.max(0, length - safeRevealed) * 100;
  const target = 8 + 2 * length;
  const speedBonus = Math.round(50 * Math.max(0, 1 - Math.max(0, elapsedSeconds) / target));
  return { base, speedBonus, total: base + speedBonus };
}

export const DEMO_QUESTIONS = [
  { answer: 'EYER', clue: 'Binicinin oturduğu, at takımlarının temel parçası.', type: 'işlev', difficulty: 'kolay', memory: 'At binme anısı' },
  { answer: 'YELE', clue: 'Atın boyun kısmında uzayan kılların adı.', type: 'doğrudan tanım', difficulty: 'kolay', memory: 'At binme anısı' },
  { answer: 'SEYİS', clue: 'Atların bakımını ve günlük düzenini üstlenen görevli.', type: 'meslek', difficulty: 'orta', memory: 'At binme anısı' },
  { answer: 'YULAR', clue: 'Atın başına takılarak yönlendirilmesini sağlayan bağ.', type: 'nesne-işlev', difficulty: 'orta', memory: 'At binme anısı' },
  { answer: 'ÜZENGİ', clue: 'Binicinin ayağını dayadığı, eyere bağlı halka biçimli araç.', type: 'dolaylı tanım', difficulty: 'orta', memory: 'At binme anısı' },
  { answer: 'KISRAK', clue: 'Yetişkin dişi at için kullanılan ad.', type: 'doğrudan tanım', difficulty: 'kolay', memory: 'At binme anısı' },
  { answer: 'ATÇILIK', clue: 'At yetiştirme, bakım ve binicilik çevresindeki uğraşların bütünü.', type: 'kategori', difficulty: 'orta', memory: 'At binme anısı' },
  { answer: 'TURŞUCU', clue: 'Sebzeleri salamura ederek turşu hazırlayan kişi.', type: 'meslek', difficulty: 'orta', memory: 'Salatalık anısı' },
  { answer: 'MAYDANOZ', clue: 'Yaprakları mutfakta sık kullanılan, demet hâlinde satılan kokulu bitki.', type: 'dolaylı tanım', difficulty: 'kolay', memory: 'Yemek ve sofra çağrışımı' },
  { answer: 'TURŞULUK', clue: 'Salamura yapımına uygun olma niteliğini anlatan sözcük.', type: 'kullanım alanı', difficulty: 'orta', memory: 'Salatalık anısı' },
  { answer: 'SALATALIK', clue: 'Turşu kavanozunda sıkça rastlanan, kabakgillerden sofralık ürün.', type: 'bilimsel/kültürel', difficulty: 'kolay', memory: 'Salatalık anısı' },
  { answer: 'BİNİCİLİK', clue: 'At üzerinde dengede kalarak hareket etmeyi ve atı yönetmeyi kapsayan spor dalı.', type: 'kategori', difficulty: 'orta', memory: 'At binme anısı' },
  { answer: 'ATBAKICISI', clue: 'Bir ahırda atların beslenmesi, temizliği ve günlük bakımıyla ilgilenen kişi.', type: 'meslek', difficulty: 'zor', memory: 'At binme anısı' },
  { answer: 'EVCİLLEŞME', clue: 'Yabanî bir türün insan denetiminde yaşamaya ve üremeye uyum sağlaması süreci.', type: 'tarihî/bilimsel', difficulty: 'zor', memory: 'Atın evcilleştirilmesi' },
  { answer: 'BİTKİBİLİMİ', clue: 'Bitkilerin yapısını, gelişimini ve sınıflandırılmasını inceleyen bilim alanı.', type: 'bilimsel bilgi', difficulty: 'zor', memory: 'Salatalık anısı' }
];

export function createRound(questions = DEMO_QUESTIONS) {
  const required = [4, 5, 6, 7, 8, 9, 10];
  const selected = required.flatMap((length) => {
    const group = questions.filter((q) => letterCount(q.answer) === length);
    if (group.length < 2) throw new Error(`${length} harfli soru sayısı 2'den az.`);
    return group.slice(0, 2);
  });
  if (selected.length !== 14) throw new Error('Tur 14 sorudan oluşmalıdır.');
  return selected.map((q, index) => ({
    ...q,
    id: `q-${index + 1}`,
    answerLetters: Array.from(normalizeAnswer(q.answer)),
    revealed: [],
    attempts: 0,
    status: 'pending'
  }));
}

export function evaluateGuess(guess, answer) {
  return normalizeAnswer(guess) === normalizeAnswer(answer);
}
