export const GEMINI_TTS_VOICES = [
  'Zephyr','Puck','Charon','Kore','Fenrir','Leda','Orus','Aoede','Callirrhoe','Autonoe',
  'Enceladus','Iapetus','Umbriel','Algieba','Despina','Erinome','Algenib','Rasalgethi',
  'Laomedeia','Achernar','Alnilam','Schedar','Gacrux','Pulcherrima','Achird',
  'Zubenelgenubi','Vindemiatrix','Sadachbia','Sadaltager','Sulafat',
] as const;

export type GeminiTtsVoice = typeof GEMINI_TTS_VOICES[number];
export const DEFAULT_GEMINI_TTS_VOICE: GeminiTtsVoice = 'Charon';
