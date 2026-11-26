import AsyncStorage from '@react-native-async-storage/async-storage';

export type JournalEntry = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  author: string;
  visibility: 'shared' | 'private';
};
const KEY = 'iz.journal.v1';
export async function loadEntries(): Promise<JournalEntry[]> {
  try { return JSON.parse((await AsyncStorage.getItem(KEY)) || '[]'); }
  catch { return []; }
}
export async function saveEntry(entry: JournalEntry) {
  const all = await loadEntries();
  await AsyncStorage.setItem(KEY, JSON.stringify([entry, ...all]));
}
