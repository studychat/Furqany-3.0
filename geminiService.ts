
import { GoogleGenAI, Modality } from "@google/genai";
import { Verse } from "./types";

export const getChildFriendlyExplanation = async (verse: Verse, surahName: string, isPremium: boolean): Promise<string> => {
  if (!isPremium) return "L'assistant IA est réservé aux membres Premium.";
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Explique ce verset de la sourate ${surahName} à une enfant de 7 ans de manière simple et noble. "${verse.arabic} - ${verse.french}"`,
      config: {
        systemInstruction: "Tu es 'Lumi', une petite guide bienveillante. Ton langage est doux, clair et respecte strictement le dogme des gens de la Sounnah et du Consensus musulman (Ahl al-Sunnah wal-Jama'a). RÈGLES CRITIQUES : 1. INTERDICTION d'anthropomorphisme : ne décris jamais Allah avec des formes, des mains, un visage ou un corps physique. Allah ne ressemble à rien de Sa création. 2. Fidélité au consensus : reste sur les leçons morales et la grandeur d'Allah sans entrer dans des analogies simplistes ou magiques. 3. Pédagogie : maximum 2 courtes phrases encourageantes pour une enfant de 7 ans.",
        temperature: 0.3,
      }
    });
    return response.text || "C'est un verset magnifique ! Médite sur la grandeur de ton Seigneur.";
  } catch (error) {
    console.error("Error fetching explanation:", error);
    return "C'est une parole noble de ton Seigneur qui t'enseigne la sagesse.";
  }
};

export const generateCompliment = async (surahName: string, isPremium: boolean): Promise<string> => {
  if (!isPremium) return "MachaAllah ! Quel bel effort, continue ainsi sur ce noble chemin.";
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `L'enfant vient de terminer la sourate ${surahName}. Félicite-la pour ses efforts. Maximum 2 phrases.`,
      config: {
        systemInstruction: "Tu es 'Lumi', la compagne d'apprentissage de l'enfant. Tu l'encourages avec noblesse et sincérité. N'utilise jamais le mot 'magique'.",
        temperature: 0.5,
      }
    });
    return response.text || "MachaAllah ! Quel bel effort, continue ainsi sur ce noble chemin.";
  } catch (error) {
    return "MachaAllah ! Tu as fait un travail remarquable pour apprendre ce noble texte !";
  }
};

export const generateMascotAudio = async (text: string, isPremium: boolean): Promise<string | undefined> => {
  if (!isPremium) return undefined;
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: `Dis de manière calme, féminine et encourageante : ${text}` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' }, 
          },
        },
      },
    });
    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  } catch (error) {
    console.error("Error generating speech:", error);
    return undefined;
  }
};

export async function decodeAudioBuffer(base64: string, ctx: AudioContext): Promise<AudioBuffer> {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  // Utilisation sécurisée de Int16Array pour éviter les erreurs d'alignement
  const dataInt16 = new Int16Array(bytes.buffer, 0, Math.floor(bytes.byteLength / 2));
  const frameCount = dataInt16.length;
  const buffer = ctx.createBuffer(1, frameCount, 24000);
  const channelData = buffer.getChannelData(0);
  for (let i = 0; i < frameCount; i++) {
    channelData[i] = dataInt16[i] / 32768.0;
  }
  return buffer;
}
