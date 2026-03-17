
import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from './i18n';
import { SHORT_SURAHS, BADGES_LIST } from './constants';
import { UserProgress, AppMode, AppTheme, Surah } from './types';
import { Mascot } from './components/Mascot';
import { VerseDisplay } from './components/VerseDisplay';
import { GamesSection } from './components/GamesSection';
import LearningCalendar from './components/LearningCalendar';
import PrayerTimes from './components/PrayerTimes';
import { generateCompliment } from './geminiService';
import { auth, db, googleProvider } from './firebase';
import { signInWithPopup, onAuthStateChanged, signOut, User } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { LanguageSwitcher } from './components/LanguageSwitcher';

const PARENTAL_CODE = "70000";

const App: React.FC = () => {
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [isPremium, setIsPremium] = useState(false);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isWelcomeSeen, setIsWelcomeSeen] = useState(() => {
    return localStorage.getItem('furqany_welcome_seen') === 'true';
  });

  const [progress, setProgress] = useState<UserProgress>(() => {
    const saved = localStorage.getItem('furqany_progress_v6');
    return saved ? JSON.parse(saved) : {
      completedSurahs: [],
      completedVerses: [],
      badges: [],
      streak: 0,
      theme: 'rose',
      reciter: 'hossary',
      fontSize: 3,
      activityLog: {},
      unlockedQuarters: [4],
      gameStars: 20
    };
  });

  const exportProgress = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(progress));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "furqany_progress.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const [mode, setMode] = useState<AppMode>(AppMode.SELECTION);
  const [filterMode, setFilterMode] = useState<'all' | 'completed'>('all');
  const [selectedSurah, setSelectedSurah] = useState<Surah | null>(null);
  const [currentVerseIndex, setCurrentVerseIndex] = useState(0);
  const [showCelebration, setShowCelebration] = useState(false);
  const [showParentalValidation, setShowParentalValidation] = useState(false);
  const [showNotice, setShowNotice] = useState(false);
  const [parentInput, setParentInput] = useState('');
  const [celebrationData, setCelebrationData] = useState({ compliment: '', badge: null as any });
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [showEncouragement, setShowEncouragement] = useState(false);
  const [encouragementText, setEncouragementText] = useState("");
  const [showReciterPicker, setShowReciterPicker] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [manualContent, setManualContent] = useState('');
  const [showProfileSetup, setShowProfileSetup] = useState(false);

  useEffect(() => {
    if (showManual && !manualContent) {
      fetch('/manual.md')
        .then(response => response.text())
        .then(text => setManualContent(text))
        .catch(err => console.error('Failed to load manual', err));
    }
  }, [showManual, manualContent]);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [expandedQuarterId, setExpandedQuarterId] = useState<number | null>(4);
  const [unlockingQuarterId, setUnlockingQuarterId] = useState<number | null>(null);
  const [unlockInput, setUnlockInput] = useState('');
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      console.log("Auth state changed:", currentUser);
      setUser(currentUser);
      setIsAuthReady(true);
      if (currentUser) {
        try {
          const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
          if (userDoc.exists()) {
            const data = userDoc.data() as UserProgress;
            setProgress(data);
            setIsPremium(data.isPremium || false);
            
            // Sync with local cache and i18n
            if (data.userName) localStorage.setItem('furqany_userName', data.userName);
            if (data.gender) localStorage.setItem('furqany_gender', data.gender);
            if (data.preferredLanguage) {
              i18n.changeLanguage(data.preferredLanguage);
            }
          } else {
            // Check local cache if Firebase is empty
            const cachedName = localStorage.getItem('furqany_userName');
            const cachedGender = localStorage.getItem('furqany_gender') as any;
            
            if (cachedName && cachedGender) {
              const newProgress = { ...progress, userName: cachedName, gender: cachedGender };
              setProgress(newProgress);
              await setDoc(doc(db, 'users', currentUser.uid), newProgress);
            } else {
              await setDoc(doc(db, 'users', currentUser.uid), progress);
              setShowProfileSetup(true);
            }
          }
        } catch (error: any) {
          console.error("Error fetching/setting user doc:", error);
          setErrorMsg(`${t('error_data')} (${error?.code || 'inconnue'}).`);
        }
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (user) {
      setDoc(doc(db, 'users', user.uid), progress);
    } else {
      localStorage.setItem('furqany_progress_v6', JSON.stringify(progress));
    }
  }, [progress, user]);

  useEffect(() => {
    if (mainRef.current) {
      mainRef.current.scrollTop = 0;
    }
  }, [mode, selectedSurah]);

  useEffect(() => {
    if (progress.gameStars === 0) {
      setProgress(prev => ({ ...prev, gameStars: 20 }));
    }
  }, []);

  const handleStartApp = () => {
    localStorage.setItem('furqany_welcome_seen', 'true');
    setIsWelcomeSeen(true);
  };

  const selectSurah = (surah: Surah) => {
    setSelectedSurah(surah);
    setCurrentVerseIndex(0);
    setMode(AppMode.LEARNING);
  };

  const nextVerse = () => {
    if (selectedSurah && currentVerseIndex < selectedSurah.verses.length - 1) {
      setCurrentVerseIndex(v => v + 1);
    } else {
      initiateParentalValidation();
    }
  };

  const initiateParentalValidation = () => {
    setParentInput('');
    setShowParentalValidation(true);
  };

  const handleVerseValidation = () => {
    if (selectedSurah) {
      const verseKey = `${selectedSurah.id}_${selectedSurah.verses[currentVerseIndex].number}`;
      if (!progress.completedVerses.includes(verseKey)) {
        setProgress(prev => ({
          ...prev,
          completedVerses: [...prev.completedVerses, verseKey]
        }));
      }
      
      const encouragements = [
        "MachaAllah ! C'est magnifique ! ❤️",
        "Bravo ! Tu es sur le bon chemin ! 🌟",
        "SubhanAllah ! Quelle belle récitation ! ✨",
        "Super ! Allah t'aime et t'aide ! 💖",
        "Génial ! Tu progresses super bien ! 🚀"
      ];
      setEncouragementText(encouragements[Math.floor(Math.random() * encouragements.length)]);
      setShowEncouragement(true);
      setTimeout(() => setShowEncouragement(false), 3000);
    }
    initiateParentalValidation();
  };

  const handleParentConfirm = async () => {
    if (parentInput !== PARENTAL_CODE) {
      alert("Code incorrect. Seul un adulte peut valider la mémorisation.");
      return;
    }

    setShowParentalValidation(false);
    if (!selectedSurah) return;
    
    const compliment = await generateCompliment(selectedSurah.name, isPremium, progress.userName, progress.gender);
    let newBadge = null;

    if (selectedSurah.id === 1 && !progress.badges.includes('cle_tresor')) newBadge = BADGES_LIST.find(b => b.id === 'cle_tresor');
    else if (selectedSurah.id === 2 && !progress.badges.includes('bouclier_or')) newBadge = BADGES_LIST.find(b => b.id === 'bouclier_or');
    else if (selectedSurah.id === 93 && !progress.badges.includes('soleil_matin')) newBadge = BADGES_LIST.find(b => b.id === 'soleil_matin');

    const completedCount = progress.completedSurahs.length + 1;
    if (completedCount === 3 && !progress.badges.includes('etoile_guide')) newBadge = BADGES_LIST.find(b => b.id === 'etoile_guide');

    setCelebrationData({ compliment, badge: newBadge });
    setShowCelebration(true);

    setProgress(prev => ({
      ...prev,
      completedSurahs: [...new Set([...prev.completedSurahs, selectedSurah.id])],
      badges: newBadge ? [...new Set([...prev.badges, newBadge.id])] : prev.badges
    }));
  };

  const handleQuarterClick = (quarterId: number) => {
    const isUnlocked = progress.unlockedQuarters?.includes(quarterId) || quarterId === 4;
    
    if (!isUnlocked) {
      setUnlockingQuarterId(quarterId);
      setUnlockInput('');
      return;
    }

    setExpandedQuarterId(expandedQuarterId === quarterId ? null : quarterId);
  };

  const confirmUnlock = () => {
    if (unlockInput === PARENTAL_CODE) {
      if (unlockingQuarterId) {
        setProgress(prev => ({
          ...prev,
          unlockedQuarters: [...(prev.unlockedQuarters || []), unlockingQuarterId]
        }));
        setExpandedQuarterId(unlockingQuarterId);
      }
      setUnlockingQuarterId(null);
    } else {
      alert("Code incorrect !");
    }
  };

  const closeCelebration = () => {
    setShowCelebration(false);
    setMode(AppMode.SELECTION);
    setSelectedSurah(null);
  };

  const tryOpenGames = () => {
    setMode(AppMode.GAMES);
  };

  const themeClasses = {
    emerald: 'bg-[url(/emerald.png)] bg-cover bg-center text-emerald-900',
    gold: 'bg-[url(/gold.png)] bg-cover bg-center text-amber-900',
    indigo: 'bg-[url(/indigo.png)] bg-cover bg-center text-indigo-900',
    rose: 'bg-[url(/rose.png)] bg-cover bg-center text-rose-900',
  };

  const surahNameTextClasses = {
    emerald: 'text-emerald-900',
    gold: 'text-amber-900',
    indigo: 'text-indigo-900',
    rose: 'text-rose-900',
  };

  const buttonClasses = {
    emerald: 'bg-emerald-600/80 active:bg-emerald-700 shadow-emerald-200',
    gold: 'bg-amber-500/80 active:bg-amber-600 shadow-amber-200',
    indigo: 'bg-indigo-600/80 active:bg-indigo-700 shadow-indigo-200',
    rose: 'bg-rose-500/80 active:bg-rose-600 shadow-rose-200',
  };

  if (!isAuthReady) return <div className="h-[100dvh] flex items-center justify-center">Chargement...</div>;
  if (!user) {
    return (
      <div className={`h-[100dvh] ${themeClasses[progress.theme]} flex items-center justify-center p-6 select-none relative`}>
        <div className="absolute top-8 right-8 z-50">
          <LanguageSwitcher />
        </div>
        <div className="max-w-md w-full bg-white/80 backdrop-blur-xl p-8 rounded-[3rem] shadow-2xl border-4 border-white/50 text-center flex flex-col items-center gap-5">
          <p className="text-sm font-bold text-rose-500 uppercase tracking-widest mb-1">Dès 4 ans</p>
          <h1 className="text-3xl font-black text-rose-700">{t('welcome_title')}</h1>
          <button onClick={() => {
            console.log("Attempting sign in from origin:", window.location.origin);
            signInWithPopup(auth, googleProvider).catch(err => {
              console.error("Sign in error details:", err);
              if (err.code === 'auth/unauthorized-domain') {
                 alert("ERREUR CHROME : Firebase ne reconnaît pas ce domaine.\n\n" +
                       "Causes possibles :\n" +
                       "1. Les 'Cookies tiers' sont bloqués dans Chrome (vérifiez Paramètres > Confidentialité).\n" +
                       "2. L'extension AdBlock modifie l'envoi du domaine.\n" +
                       "3. Le domaine " + window.location.hostname + " n'est pas dans la console Firebase (Authentication > Settings).");
              } else {
                 setErrorMsg(`${t('error_data')} : ` + err.message);
              }
            });
          }} className={`w-full py-5 ${buttonClasses[progress.theme]} text-white text-xl font-black rounded-full shadow-lg active:scale-95 transition-transform`}>
            {t('login_google')}
          </button>
        </div>
      </div>
    );
  }

  if (!isWelcomeSeen) {
    return (
      <div className={`h-[100dvh] ${themeClasses[progress.theme]} flex items-center justify-center p-6 select-none relative`}>
        <div className="absolute top-8 right-8 z-50">
          <LanguageSwitcher />
        </div>
        <div className="max-w-md w-full bg-white/80 backdrop-blur-xl p-8 rounded-[3rem] shadow-2xl border-4 border-white/50 text-center flex flex-col items-center gap-5 relative overflow-hidden">
          <div className="absolute -top-10 -right-10 w-32 h-32 bg-rose-200/30 rounded-full blur-2xl"></div>
          <div className="text-6xl animate-bounce">🎁</div>
          <p className="text-sm font-bold text-rose-500 uppercase tracking-widest mb-1">Dès 4 ans</p>
          <h1 className="text-3xl font-black text-rose-700 leading-tight">{t('welcome_title')}</h1>
          <div className="bg-amber-50/80 p-6 rounded-[2rem] border border-amber-100/50 leading-relaxed shadow-inner text-left">
             <p className="text-md font-bold text-amber-900 italic mb-2">"{t('salut')} !"</p>
             <p className="text-base text-amber-800 font-medium">
               {t('welcome_desc')}
             </p>
          </div>
          <button onClick={handleStartApp} className={`w-full py-5 ${buttonClasses[progress.theme]} text-white text-xl font-black rounded-full shadow-lg active:scale-95 transition-transform`}>
            {t('open_gift')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div 
      dir={i18n.dir()}
      className={`h-[100dvh] ${themeClasses[progress.theme]} font-sans transition-colors duration-700 flex flex-col select-none pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] ${i18n.language === 'ar' ? 'rtl-layout' : ''}`}
    >
      {showEncouragement && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[200] animate-in slide-in-from-top-4 duration-500">
          <div className="bg-white/90 backdrop-blur-md px-8 py-4 rounded-3xl shadow-2xl border-4 border-rose-100 flex items-center gap-3">
            <span className="text-2xl">✨</span>
            <p className="text-rose-700 font-black text-lg whitespace-nowrap">{encouragementText}</p>
          </div>
        </div>
      )}
      <header className="px-4 py-2 flex justify-between items-center z-40 bg-white/40 backdrop-blur-md border-b border-white/20">
        <div className="relative flex items-center gap-3 w-full">
          <button 
            onClick={() => setShowMenu(!showMenu)} 
            className="w-10 h-10 bg-white/80 rounded-full flex items-center justify-center shadow-sm active:scale-90 transition-transform text-xl border border-white/50"
          >
            ☰
          </button>
          <div className="flex flex-col">
            <h2 className="text-xl font-black text-rose-700 leading-tight">Furqany</h2>
            <p className="text-[10px] font-black text-rose-400 uppercase tracking-tighter -mt-1">{t('salut')}, {progress.userName || 'Ami'} ! ✨</p>
          </div>
          <div className="ms-auto flex items-center gap-2">
            <LanguageSwitcher />
            {user && (
              <button 
                onClick={() => signOut(auth)} 
                className="w-10 h-10 bg-red-100/80 text-red-600 rounded-full flex items-center justify-center shadow-sm active:scale-90 transition-transform text-xl" 
                title={t('menu.logout')}
              >
                🚪
              </button>
            )}
          </div>
        </div>

        {showMenu && (
          <div className="absolute top-full left-4 right-4 mt-2 bg-white/80 backdrop-blur-xl p-4 rounded-[2.5rem] shadow-2xl z-50 border-4 border-white/50 animate-in slide-in-from-top-4 flex flex-col gap-2">
             <button 
              onClick={() => { setMode(AppMode.SELECTION); setShowMenu(false); }}
              className={`w-full p-4 flex items-center rounded-2xl transition-colors ${mode === AppMode.SELECTION ? 'bg-rose-50 text-rose-600' : 'hover:bg-gray-50'}`}
            >
              <span className="text-2xl mr-3">🏠</span>
              <span className="font-bold">{t('menu.home')}</span>
            </button>
            
            <button 
              onClick={() => { setMode(AppMode.COMPLETED_LIST); setShowMenu(false); }}
              className={`w-full p-4 flex items-center rounded-2xl transition-colors ${mode === AppMode.COMPLETED_LIST ? 'bg-rose-50 text-rose-600' : 'hover:bg-gray-50'}`}
            >
              <span className="text-2xl mr-3">📚</span>
              <span className="font-bold">{t('menu.completed')}</span>
            </button>
            
            <button 
              onClick={() => { setMode(AppMode.GAMES); setShowMenu(false); }}
              className={`w-full p-4 flex items-center rounded-2xl transition-colors ${mode === AppMode.GAMES ? 'bg-rose-50 text-rose-600' : 'hover:bg-gray-50'}`}
            >
              <span className="text-2xl mr-3">🎮</span>
              <span className="font-bold">{t('menu.games')}</span>
            </button>

            <button 
              onClick={() => { setMode(AppMode.BADGES); setShowMenu(false); }}
              className={`w-full p-4 flex items-center rounded-2xl transition-colors ${mode === AppMode.BADGES ? 'bg-rose-50 text-rose-600' : 'hover:bg-gray-50'}`}
            >
              <span className="text-2xl mr-3">🏅</span>
              <span className="font-bold">{t('menu.badges')}</span>
            </button>
            
            <div className="h-px bg-gray-100 my-2" />
            
            <button onClick={() => { setShowNotice(true); setShowMenu(false); }} className="w-full p-3 flex items-center text-sm font-bold text-gray-600 hover:bg-gray-50 rounded-xl">ℹ️ Guide Parents</button>
            <button onClick={() => { setShowThemePicker(true); setShowMenu(false); }} className="w-full p-3 flex items-center text-sm font-bold text-gray-600 hover:bg-gray-50 rounded-xl">🎨 Thèmes</button>
            <button onClick={() => { setShowReciterPicker(true); setShowMenu(false); }} className="w-full p-3 flex items-center text-sm font-bold text-gray-600 hover:bg-gray-50 rounded-xl">🎙️ Récitateurs</button>
            <button onClick={() => { exportProgress(); setShowMenu(false); }} className="w-full p-3 flex items-center text-sm font-bold text-gray-600 hover:bg-gray-50 rounded-xl">💾 Sauvegarder</button>
          </div>
        )}
      </header>

      <main ref={mainRef} className="flex-1 overflow-y-auto custom-scrollbar px-4 py-6">
        {errorMsg && (
          <div className="mb-4 bg-rose-100 border-2 border-rose-200 p-3 rounded-xl text-rose-700 font-bold text-center animate-shake text-sm">
            {errorMsg}
          </div>
        )}

        {mode === AppMode.SELECTION ? (
          <div className="max-w-md mx-auto space-y-6 pb-20">
            {/* Dashboard Header Stats */}
            <div className="grid grid-cols-2 gap-3">
              <button 
                onClick={() => setFilterMode(filterMode === 'completed' ? 'all' : 'completed')}
                className={`p-4 rounded-3xl shadow-sm border-2 border-white/50 backdrop-blur-sm flex flex-col items-center justify-center text-center active:translate-y-0.5 transition-all ${
                  filterMode === 'completed' 
                    ? 'bg-emerald-500/80 border-emerald-700/50 text-white' 
                    : 'bg-white/60 hover:bg-white/70'
                }`}
              >
                <span className="text-2xl mb-1">📖</span>
                <span className={`text-lg font-black ${filterMode === 'completed' ? 'text-white' : 'text-emerald-700'}`}>{progress.completedSurahs.length}</span>
                <span className={`text-[10px] font-bold ${filterMode === 'completed' ? 'text-emerald-100' : 'text-gray-400'} uppercase`}>{t('learned')}</span>
              </button>
              <button 
                onClick={() => setShowNotice(true)}
                className="bg-white/60 backdrop-blur-sm p-4 rounded-3xl shadow-sm border-2 border-white/50 flex flex-col items-center justify-center text-center active:translate-y-0.5 transition-all hover:bg-white/70"
              >
                <span className="text-2xl mb-1">🔥</span>
                <span className="text-lg font-black text-orange-600">{progress.streak}</span>
                <span className="text-[10px] font-bold text-gray-400 uppercase">{t('days')}</span>
              </button>
            </div>

            {/* Learning Calendar */}
            <LearningCalendar theme={progress.theme} />

            {/* Badges Quick View */}
            {progress.badges.length > 0 && (
              <div className="bg-white/60 backdrop-blur-sm p-4 rounded-[2rem] border border-white/50">
                <div className="flex justify-between items-center mb-3 px-2">
                  <h4 className="text-sm font-black text-gray-600 uppercase tracking-wider">Mes Trophées</h4>
                  <button onClick={() => setMode(AppMode.BADGES)} className="text-xs font-bold text-rose-500">Voir tout ➡</button>
                </div>
                <div className="flex gap-3 overflow-x-auto pb-2 custom-scrollbar">
                  {progress.badges.slice(-4).map(badgeId => {
                    const badge = BADGES_LIST.find(b => b.id === badgeId);
                    return (
                      <div key={badgeId} className="min-w-[60px] h-[60px] bg-white rounded-2xl flex items-center justify-center text-2xl shadow-sm border border-gray-50">
                        {badge?.emoji}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Surah List Section by Quarters */}
            <div className="space-y-6">
              <PrayerTimes />
              {[
                { id: 1, name: "1er Quart : Fatiha à Al-An'am", range: [1, 6], icon: "🌱" },
                { id: 2, name: "2ème Quart : Al-A'raf à Al-Isra", range: [7, 17], icon: "🌳" },
                { id: 3, name: "3ème Quart : Al-Kahf à Fatir", range: [18, 35], icon: "🏞️" },
                { id: 4, name: "4ème Quart : Nas à Yasin", range: [36, 114], icon: "🏰", inverted: true },
              ].map(quarter => {
                let surahsInQuarter = SHORT_SURAHS.filter(s => s.id >= quarter.range[0] && s.id <= quarter.range[1]);
                
                if (filterMode === 'completed') {
                  surahsInQuarter = surahsInQuarter.filter(s => progress.completedSurahs.includes(s.id));
                }

                if (quarter.inverted) {
                  // Sort by ID descending for the 4th quarter
                  surahsInQuarter = [...surahsInQuarter].sort((a, b) => b.id - a.id);
                }
                
                const isUnlocked = progress.unlockedQuarters?.includes(quarter.id) || quarter.id === 4;
                const isExpanded = expandedQuarterId === quarter.id;

                return (
                  <div key={quarter.id} className="space-y-4">
                    <button 
                      onClick={() => handleQuarterClick(quarter.id)}
                      className={`w-full flex items-center justify-between p-5 rounded-[2rem] transition-all shadow-sm border-2 ${
                        isExpanded 
                          ? (progress.theme === 'rose' ? 'bg-rose-50/80 border-rose-200/50' : 'bg-emerald-50/80 border-emerald-200/50') 
                          : 'bg-white/60 backdrop-blur-sm border-white/50'
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <span className="text-3xl">{quarter.icon}</span>
                        <div className="text-left">
                          <h3 className={`text-lg font-black ${progress.theme === 'rose' ? 'text-rose-800' : 'text-emerald-800'}`}>
                            {quarter.name}
                          </h3>
                          {!isUnlocked && <p className="text-[10px] font-bold text-rose-500 uppercase tracking-widest">🔒 Bloqué par les parents</p>}
                        </div>
                      </div>
                      <span className="text-2xl opacity-30">{isExpanded ? '🔼' : '🔽'}</span>
                    </button>

                    {isExpanded && (
                      <div className="space-y-3 px-2 animate-in slide-in-from-top-4 duration-300">
                        {surahsInQuarter.length > 0 ? (
                          surahsInQuarter.map(surah => (
                            <button 
                              key={surah.id}
                              onClick={() => selectSurah(surah)}
                              className="w-full bg-white/30 backdrop-blur-md p-4 rounded-[1.8rem] shadow-sm border border-white/40 active:border-rose-500 transition-all flex justify-between items-center group active:translate-y-0.5"
                            >
                              <div className="flex items-center gap-4">
                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-lg ${progress.completedSurahs.includes(surah.id) ? 'bg-emerald-500/20 text-emerald-700' : 'bg-white/40 text-gray-400'}`}>
                                  {surah.isSpecialVerse ? '💎' : surah.idString.replace(/^0+/, '')}
                                </div>
                                <div className="text-left">
                                  <p className={`text-lg font-black ${surahNameTextClasses[progress.theme]}`}>{surah.name}</p>
                                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tight">{surah.frenchName}</p>
                                </div>
                              </div>
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${progress.completedSurahs.includes(surah.id) ? 'bg-emerald-500/20 text-emerald-600' : 'bg-white/40 text-gray-300'}`}>
                                <span className="text-sm">{progress.completedSurahs.includes(surah.id) ? '✅' : '📖'}</span>
                              </div>
                            </button>
                          ))
                        ) : (
                          <div className="bg-white/30 backdrop-blur-sm p-6 rounded-[1.8rem] border-2 border-dashed border-white/50 text-center">
                            <p className="text-sm font-bold text-gray-500 italic">Bientôt disponible... ✨</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : mode === AppMode.COMPLETED_LIST ? (
          <div className="max-w-md mx-auto bg-white/60 backdrop-blur-md p-6 rounded-[2.5rem] shadow-xl border-4 border-white animate-in zoom-in duration-300">
             <div className="flex items-center justify-between mb-6">
                <h3 className={`text-xl font-black ${progress.theme === 'rose' ? 'text-rose-800' : 'text-emerald-800'}`}>Mes Sourates 📖</h3>
                <button onClick={() => setMode(AppMode.SELECTION)} className="text-rose-600 font-bold text-sm bg-white px-4 py-1.5 rounded-full shadow-sm">Fermer</button>
             </div>
             <div className="space-y-3 pb-10">
               {SHORT_SURAHS.filter(s => progress.completedSurahs.includes(s.id)).length > 0 ? (
                 SHORT_SURAHS.filter(s => progress.completedSurahs.includes(s.id)).map(surah => (
                   <button 
                     key={surah.id}
                     onClick={() => selectSurah(surah)}
                     className="w-full bg-white/30 backdrop-blur-md p-4 rounded-[1.8rem] shadow-sm border border-white/40 active:border-emerald-500 transition-all flex justify-between items-center group active:translate-y-0.5"
                   >
                     <div className="flex items-center gap-4">
                       <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-500 flex items-center justify-center font-bold text-lg">
                         {surah.isSpecialVerse ? '💎' : surah.idString.replace(/^0+/, '')}
                       </div>
                       <div className="text-left">
                          <p className={`text-lg font-black ${surahNameTextClasses[progress.theme]}`}>{surah.name}</p>
                         <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tight">{surah.frenchName}</p>
                       </div>
                     </div>
                     <span className="text-xl">✅</span>
                   </button>
                 ))
               ) : (
                 <div className="text-center py-10 space-y-4">
                   <span className="text-5xl block">🌱</span>
                   <p className="text-gray-500 font-bold">Tu n'as pas encore de sourates apprises. <br/> Commence ton voyage ! ✨</p>
                 </div>
               )}
             </div>
          </div>
        ) : mode === AppMode.GAMES ? (
          <div className="max-w-md mx-auto">
            <GamesSection progress={progress} setProgress={setProgress} onClose={() => setMode(AppMode.SELECTION)} theme={progress.theme} />
          </div>
        ) : mode === AppMode.BADGES ? (
          <div className="max-w-md mx-auto bg-white/60 backdrop-blur-md p-6 rounded-[2.5rem] shadow-xl border-4 border-white animate-in zoom-in duration-300">
             <div className="flex items-center justify-between mb-6">
                <h3 className={`text-xl font-black ${progress.theme === 'rose' ? 'text-rose-800' : 'text-emerald-800'}`}>Mes Trésors 🏆</h3>
                <button onClick={() => setMode(AppMode.SELECTION)} className="text-rose-600 font-bold text-sm bg-white px-4 py-1.5 rounded-full shadow-sm">Fermer</button>
             </div>
             <div className="grid grid-cols-2 gap-4 pb-10">
               {BADGES_LIST.map(badge => {
                 const isOwned = progress.badges.includes(badge.id);
                 return (
                   <div key={badge.id} className={`p-4 rounded-2xl flex flex-col items-center text-center transition-all ${isOwned ? 'bg-white shadow-md border-b-4 border-rose-500' : 'bg-gray-100/50 grayscale opacity-40'}`}>
                     <span className="text-4xl mb-2">{badge.emoji}</span>
                     <h4 className="text-xs font-black text-gray-800 focus:outline-none leading-tight">{badge.name}</h4>
                   </div>
                 );
               })}
             </div>
          </div>
        ) : mode === AppMode.LEARNING && selectedSurah ? (
          <div className="max-w-md mx-auto space-y-5 pb-10">
            <div className="flex items-center justify-between px-2">
              <button onClick={() => setMode(AppMode.SELECTION)} className="bg-white/80 px-4 py-1.5 rounded-full font-bold text-rose-700 text-sm border border-rose-200">⬅ Retour</button>
              <h3 className={`text-lg font-black ${progress.theme === 'rose' ? 'text-rose-800' : 'text-emerald-800'}`}>{selectedSurah.name}</h3>
            </div>

            <VerseDisplay 
              verse={selectedSurah.verses[currentVerseIndex]} 
              surahIdString={selectedSurah.idString}
              theme={progress.theme}
              reciter={progress.reciter}
              fontSizeScale={progress.fontSize}
              onValidate={handleVerseValidation}
            />

            <div className="flex gap-3">
              <button 
                onClick={() => setCurrentVerseIndex(v => v - 1)} 
                disabled={currentVerseIndex === 0} 
                className={`flex-1 py-4 rounded-2xl font-black text-lg transition-all ${currentVerseIndex === 0 ? 'bg-gray-200 text-gray-400' : 'bg-white text-rose-700 shadow-md active:translate-y-0.5'}`}
              >
                {t('previous')}
              </button>
              <button 
                onClick={nextVerse} 
                className={`flex-1 py-4 ${buttonClasses[progress.theme]} text-white rounded-2xl font-black text-lg shadow-lg active:scale-95 transition-transform`}
              >
                {currentVerseIndex === selectedSurah.verses.length - 1 ? `${t('validate')} ! 🏁` : `${t('next')} ➡`}
              </button>
            </div>

            <Mascot verse={selectedSurah.verses[currentVerseIndex]} surahName={selectedSurah.name} theme={progress.theme} userName={progress.userName} gender={progress.gender} isPremium={isPremium} />
          </div>
        ) : null}
      </main>

      {showNotice && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-blue-900/60 backdrop-blur-md p-4">
          <div className="bg-white/80 backdrop-blur-md w-full max-w-md p-6 rounded-[2.5rem] shadow-2xl animate-in zoom-in duration-300 max-h-[85vh] overflow-y-auto custom-scrollbar">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-black text-blue-800">Guide Parents 📚</h2>
              <button onClick={() => setShowNotice(false)} className="text-gray-400 font-bold">✖</button>
            </div>
            <div className="space-y-4 text-sm text-gray-700 leading-relaxed">
              <section className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                <h4 className="font-bold text-blue-700 mb-1">🎯 Objectif</h4>
                <p>Accompagner l'enfant dans la mémorisation des petites sourates avec plaisir.</p>
              </section>
              <section>
                <h4 className="font-bold text-gray-800 mb-1">🔐 Validation Parentale</h4>
                <p>À la fin d'une sourate, un code est demandé. Écoutez l'enfant réciter. Si c'est acquis, entrez votre code secret partagé pour débloquer le badge et les étoiles.</p>
              </section>
              <section>
                <h4 className="font-bold text-gray-800 mb-1">⭐ Récompenses</h4>
                <p>Chaque validation rapporte 50 étoiles permettant d'accéder aux mini-jeux (30 étoiles par session).</p>
              </section>
            </div>
            <button onClick={() => setShowNotice(false)} className="w-full mt-6 py-4 bg-blue-600 text-white rounded-2xl font-black shadow-lg">Compris !</button>
          </div>
        </div>
      )}

      {showManual && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-blue-900/60 backdrop-blur-md p-4">
          <div className="bg-white/80 backdrop-blur-md w-full max-w-md p-6 rounded-[2.5rem] shadow-2xl animate-in zoom-in duration-300 max-h-[85vh] overflow-y-auto custom-scrollbar">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-black text-blue-800">Mode d'emploi 📖</h2>
              <button onClick={() => setShowManual(false)} className="text-gray-400 font-bold">✖</button>
            </div>
            <div className="space-y-4 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
              {manualContent}
            </div>
            <button onClick={() => setShowManual(false)} className="w-full mt-6 py-4 bg-blue-600 text-white rounded-2xl font-black shadow-lg">Fermer</button>
          </div>
        </div>
      )}

      {showParentalValidation && (
        <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4">
          <div className="bg-white/80 backdrop-blur-md w-full max-w-md p-6 rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl animate-in slide-in-from-bottom-full duration-300">
            <h2 className="text-2xl font-black text-slate-800 text-center mb-1">Espace Parents 🛡️</h2>
            <p className="text-slate-500 text-center mb-6 text-sm font-medium">L'enfant a-t-il bien mémorisé ce passage ?</p>
            <div className="bg-slate-50 p-5 rounded-2xl border-2 border-slate-100 mb-6 text-center">
              <p className="text-sm font-bold text-slate-500 mb-4">Saisissez votre code secret :</p>
              <input 
                type="password" 
                inputMode="numeric"
                value={parentInput}
                onChange={(e) => setParentInput(e.target.value)}
                placeholder="•••••"
                className="w-full text-center py-4 bg-white rounded-xl border-2 border-slate-200 text-3xl font-black focus:border-rose-500 outline-none transition-colors tracking-[0.5rem]"
              />
            </div>
            <button onClick={handleParentConfirm} className="w-full py-5 bg-rose-600 text-white rounded-2xl text-lg font-black shadow-lg active:scale-95 transition-transform">Valider ✅</button>
            <button onClick={() => setShowParentalValidation(false)} className="w-full py-4 text-slate-400 font-bold text-sm">Annuler</button>
          </div>
        </div>
      )}

      {/* Quarter Unlock Modal */}
      {unlockingQuarterId && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-blue-900/40 backdrop-blur-md p-4">
          <div className="bg-white/80 backdrop-blur-md w-full max-w-xs p-8 rounded-[3rem] shadow-2xl text-center space-y-6 animate-in zoom-in duration-300">
            <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto text-4xl">👨‍👩‍👧</div>
            <h3 className="text-xl font-black text-blue-900">Zone Protégée</h3>
            <p className="text-sm font-bold text-blue-600/70">Entrez le code parental pour débloquer ce quartier.</p>
            <input 
              type="password" 
              inputMode="numeric"
              value={unlockInput}
              onChange={(e) => setUnlockInput(e.target.value)}
              placeholder="•••••"
              className="w-full p-4 bg-blue-50 border-2 border-blue-100 rounded-2xl text-center text-2xl font-black focus:outline-none focus:border-blue-300 tracking-[0.5rem]"
            />
            <div className="flex gap-3">
              <button onClick={() => setUnlockingQuarterId(null)} className="flex-1 py-3 font-bold text-blue-400">Annuler</button>
              <button onClick={confirmUnlock} className="flex-1 py-3 bg-blue-600 text-white rounded-2xl font-black shadow-lg shadow-blue-200">Débloquer</button>
            </div>
          </div>
        </div>
      )}

      {showProfileSetup && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-rose-900/40 backdrop-blur-md p-4">
          <div className="bg-white/90 backdrop-blur-xl w-full max-w-sm p-8 rounded-[3.5rem] shadow-2xl text-center space-y-8 animate-in zoom-in duration-500 border-8 border-white">
            {!progress.gender ? (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                <div className="w-20 h-20 bg-rose-100 rounded-full flex items-center justify-center mx-auto text-4xl">🌸</div>
                <h3 className="text-2xl font-black text-rose-900">{t('welcome_title')}</h3>
                <p className="text-lg font-bold text-rose-600/70">{t('select_gender')}</p>
                <div className="grid grid-cols-2 gap-4">
                  <button 
                    onClick={() => setProgress(p => ({ ...p, gender: 'girl' }))}
                    className="p-6 bg-pink-50 border-4 border-pink-100 rounded-[2rem] text-4xl hover:scale-105 active:scale-95 transition-all shadow-sm"
                  >
                    🌸
                    <p className="text-xs font-black text-pink-500 mt-2 uppercase">{t('girl')}</p>
                  </button>
                  <button 
                    onClick={() => setProgress(p => ({ ...p, gender: 'boy' }))}
                    className="p-6 bg-blue-50 border-4 border-blue-100 rounded-[2rem] text-4xl hover:scale-105 active:scale-95 transition-all shadow-sm"
                  >
                    🚀
                    <p className="text-xs font-black text-blue-500 mt-2 uppercase">{t('boy')}</p>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                <div className="w-20 h-20 bg-rose-100 rounded-full flex items-center justify-center mx-auto text-4xl">
                  {progress.gender === 'girl' ? '💖' : '🌟'}
                </div>
                <h3 className="text-2xl font-black text-rose-900">{t('salut')} !</h3>
                <p className="text-lg font-bold text-rose-600/70">{t('enter_name')}</p>
                <input 
                  type="text" 
                  placeholder={t('name_placeholder')}
                  autoFocus
                  value={progress.userName || ''}
                  onChange={(e) => setProgress(prev => ({ ...prev, userName: e.target.value }))}
                  className="w-full p-5 bg-white border-4 border-rose-100 rounded-3xl text-center text-xl font-black focus:outline-none focus:border-rose-400 placeholder:text-rose-200 shadow-inner"
                />
                <button 
                  disabled={!progress.userName}
                  onClick={() => {
                    if (progress.userName) {
                      localStorage.setItem('furqany_userName', progress.userName);
                      localStorage.setItem('furqany_gender', progress.gender!);
                      setShowProfileSetup(false);
                    }
                  }} 
                  className="w-full py-5 bg-rose-600 text-white rounded-3xl text-xl font-black shadow-lg shadow-rose-200 active:scale-95 transition-all disabled:opacity-50 disabled:grayscale"
                >
                  {t('validate')}
                </button>
                <button 
                  onClick={() => setProgress(p => ({ ...p, gender: undefined }))}
                  className="text-xs font-bold text-rose-400 uppercase tracking-widest"
                >
                  ⬅ {t('menu.home')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {showCelebration && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-rose-900/70 backdrop-blur-md p-6 overflow-y-auto">
          <div className="bg-white/80 backdrop-blur-md w-full max-sm:w-full max-w-sm p-8 rounded-[3.5rem] shadow-2xl border-[6px] border-yellow-400/50 animate-in zoom-in duration-500 flex flex-col items-center gap-5 text-center relative my-4">
            <div className="text-7xl animate-bounce mt-2">🏆</div>
            <h2 className="text-3xl font-black text-rose-700 leading-tight">MachaAllah !</h2>
            <div className="bg-rose-50 p-5 rounded-2xl border border-rose-100 text-gray-700 text-base font-medium leading-relaxed">
              "{celebrationData.compliment}"
            </div>
            {celebrationData.badge && (
              <div className="flex flex-col items-center animate-in slide-in-from-bottom-4 duration-700">
                <div className="w-24 h-24 bg-yellow-100 rounded-full flex items-center justify-center text-5xl shadow-inner border-2 border-yellow-300 transform rotate-6 mb-2">
                  {celebrationData.badge.emoji}
                </div>
                <p className="font-black text-sm text-yellow-600 uppercase tracking-widest">{celebrationData.badge.name}</p>
              </div>
            )}
            <button onClick={closeCelebration} className={`w-full py-5 rounded-[1.8rem] text-white text-xl font-black shadow-lg active:scale-95 transition-transform ${buttonClasses[progress.theme]}`}>
              {t('validate')} ! 🚀
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
