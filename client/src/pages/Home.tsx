import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";

/**
 * Design Philosophy: "الطاقة والحيوية" (Energy & Vibrancy)
 * - Warm, vibrant colors with dynamic interactions
 * - Vertical pathway connecting levels and tests
 * - Circular medallions for each level with color coding
 * - Smooth transitions and calculated animations
 * - Arabic typography: Reem Kufi (display) + Tajawal (body)
 */

interface Level {
  id: string;
  kind: "level" | "test";
  name: string;
  range: string;
  ranges: [number, number][];
  unlockedBy: string | null;
  color: "yellow" | "blue" | "lilac" | "coral";
  icon: string;
}

interface GameSession {
  levelId: string;
  isRetrain: boolean;
  queue: number[];
  index: number;
  correct: number;
  wrong: number;
  pointsEarned: number;
  currentTarget: number | null;
  currentOptions: OptionData[];
  selected: Set<number>;
  answered: boolean;
}

interface OptionData {
  a: number;
  b: number;
  da: number;
  db: number;
  correct: boolean;
}

interface LevelState {
  completed: boolean;
  mistakes: number[];
}

const BASE_RANGES: [number, number][] = [
  [1, 9],
  [10, 19],
  [20, 29],
  [30, 39],
  [40, 49],
  [50, 59],
  [60, 69],
  [70, 79],
  [80, 89],
  [90, 99],
];

const LEVEL_COLORS = ["yellow", "blue", "lilac"] as const;
const MAX_FACTOR = 10;

function isPrime(n: number): boolean {
  if (n < 2) return false;
  for (let i = 2; i * i <= n; i++) {
    if (n % i === 0) return false;
  }
  return true;
}

function factorPairs(n: number): [number, number][] {
  const pairs: [number, number][] = [];
  for (let i = 2; i * i <= n; i++) {
    if (n % i === 0) {
      const j = n / i;
      if (j > 1 && i <= MAX_FACTOR && j <= MAX_FACTOR) {
        pairs.push([i, j]);
      }
    }
  }
  return pairs;
}

function poolFor(level: Level): number[] {
  const nums: number[] = [];
  level.ranges.forEach(([lo, hi]) => {
    for (let n = lo; n <= hi; n++) {
      if (n > 1 && !isPrime(n) && factorPairs(n).length > 0) {
        nums.push(n);
      }
    }
  });
  return nums;
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function generateOptions(target: number): OptionData[] {
  const correctPairs = factorPairs(target);
  let options = correctPairs.map((p) => ({
    a: p[0],
    b: p[1],
    da: 0,
    db: 0,
    correct: true,
  }));

  function hasPair(a: number, b: number): boolean {
    return options.some((o) => (o.a === a && o.b === b) || (o.a === b && o.b === a));
  }

  let attempts = 0;
  while (options.length < 4 && attempts < 300) {
    attempts++;
    const a = 2 + Math.floor(Math.random() * (MAX_FACTOR - 1));
    const b = 2 + Math.floor(Math.random() * (MAX_FACTOR - 1));
    if (a * b === target) continue;
    if (hasPair(a, b)) continue;
    options.push({ a, b, da: 0, db: 0, correct: false });
  }

  options = options.map((o) => {
    if (Math.random() < 0.5) {
      return { ...o, da: o.a, db: o.b };
    }
    return { ...o, da: o.b, db: o.a };
  });

  shuffle(options);
  return options;
}

const buildLevels = (): Level[] => {
  const levels: Level[] = [];
  let prevId: string | null = null;

  BASE_RANGES.forEach((range, idx) => {
    const levelNum = idx + 1;
    const levelId = "l" + levelNum;

    levels.push({
      id: levelId,
      kind: "level",
      name: "المستوى " + levelNum,
      range: range[0] + " – " + range[1],
      ranges: [range],
      unlockedBy: prevId,
      color: LEVEL_COLORS[idx % LEVEL_COLORS.length],
      icon: String(levelNum),
    });

    prevId = levelId;

    if (idx >= 1) {
      const testNum = idx;
      const testId = "t" + testNum;
      const isFinal = levelNum === BASE_RANGES.length;

      levels.push({
        id: testId,
        kind: "test",
        name: "الاختبار " + testNum + (isFinal ? " (الأخير)" : ""),
        range: "1 – " + range[1],
        ranges: BASE_RANGES.slice(0, idx + 1),
        unlockedBy: prevId,
        color: "coral",
        icon: String(testNum),
      });

      prevId = testId;
    }
  });

  return levels;
};

export default function Home() {
  const LEVELS = useMemo(() => buildLevels(), []);

  const [state, setState] = useState<Record<string, LevelState>>(() => {
    const s: Record<string, LevelState> = {};
    LEVELS.forEach((l) => {
      s[l.id] = { completed: false, mistakes: [] };
    });
    return s;
  });

  const [totalPoints, setTotalPoints] = useState(0);
  const [totalWrong, setTotalWrong] = useState(0);
  const [screen, setScreen] = useState<"home" | "game" | "summary">("home");
  const [session, setSession] = useState<GameSession | null>(null);

  const startLevel = (levelId: string, retrain: boolean) => {
    const level = LEVELS.find((l) => l.id === levelId);
    if (!level) return;

    const pool = retrain ? [...state[levelId].mistakes] : poolFor(level);
    if (pool.length === 0) {
      setScreen("home");
      return;
    }

    shuffle(pool);
    const newSession: GameSession = {
      levelId,
      isRetrain: retrain,
      queue: pool,
      index: 0,
      correct: 0,
      wrong: 0,
      pointsEarned: 0,
      currentTarget: null,
      currentOptions: [],
      selected: new Set(),
      answered: false,
    };

    setSession(newSession);
    nextQuestionInSession(newSession);
    setScreen("game");
  };

  const nextQuestionInSession = (sess: GameSession) => {
    if (sess.index >= sess.queue.length) {
      finishLevel(sess);
      return;
    }

    const target = sess.queue[sess.index];
    const options = generateOptions(target);

    setSession({
      ...sess,
      currentTarget: target,
      currentOptions: options,
      selected: new Set(),
      answered: false,
    });
  };

  const toggleOption = (idx: number) => {
    if (!session || session.answered) return;

    const newSelected = new Set(session.selected);
    if (newSelected.has(idx)) {
      newSelected.delete(idx);
    } else {
      newSelected.add(idx);
    }

    setSession({ ...session, selected: newSelected });
  };

  const submitAnswer = () => {
    if (!session || session.answered || session.selected.size === 0) return;

    const correctIdxArray = session.currentOptions
      .map((o, i) => (o.correct ? i : null))
      .filter((i) => i !== null) as number[];
    const correctIdx = new Set(correctIdxArray);

    const isCorrect =
      correctIdx.size === session.selected.size &&
      correctIdxArray.every((i) => session.selected.has(i));

    const target = session.currentTarget!;
    const newState = { ...state };

    if (isCorrect) {
      session.correct++;
      session.pointsEarned += 10;
      setTotalPoints(totalPoints + 10);
      newState[session.levelId].mistakes = newState[session.levelId].mistakes.filter(
        (n) => n !== target
      );
    } else {
      session.wrong++;
      setTotalWrong(totalWrong + 1);
      if (!newState[session.levelId].mistakes.includes(target)) {
        newState[session.levelId].mistakes.push(target);
      }
    }

    setState(newState);
    setSession({ ...session, answered: true });
  };

  const nextQuestion = () => {
    if (!session) return;
    const newSession = { ...session, index: session.index + 1 };
    nextQuestionInSession(newSession);
  };

  const finishLevel = (sess: GameSession) => {
    if (!sess.isRetrain) {
      const newState = { ...state };
      newState[sess.levelId].completed = true;
      setState(newState);
    }
    setSession(sess);
    setScreen("summary");
  };

  const goHome = () => {
    setScreen("home");
  };

  const nextItemAfter = (id: string) => {
    return LEVELS.find((l) => l.unlockedBy === id);
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#FBF6E9" }}>
      {screen === "home" && (
        <HomeScreen
          levels={LEVELS}
          state={state}
          totalPoints={totalPoints}
          totalWrong={totalWrong}
          onLevelClick={(levelId) => startLevel(levelId, false)}
          onRetrain={(levelId) => startLevel(levelId, true)}
        />
      )}

      {screen === "game" && session && (
        <GameScreen
          session={session}
          level={LEVELS.find((l) => l.id === session.levelId)!}
          onToggleOption={toggleOption}
          onSubmit={submitAnswer}
          onNext={nextQuestion}
          onBack={goHome}
        />
      )}

      {screen === "summary" && session && (
        <SummaryScreen
          session={session}
          level={LEVELS.find((l) => l.id === session.levelId)!}
          state={state[session.levelId]}
          nextLevel={nextItemAfter(session.levelId)}
          onRetrain={() => startLevel(session.levelId, true)}
          onContinue={(nextId) => startLevel(nextId, false)}
          onBack={goHome}
        />
      )}
    </div>
  );
}

function HomeScreen({
  levels,
  state,
  totalPoints,
  totalWrong,
  onLevelClick,
  onRetrain,
}: {
  levels: Level[];
  state: Record<string, LevelState>;
  totalPoints: number;
  totalWrong: number;
  onLevelClick: (id: string) => void;
  onRetrain: (id: string) => void;
}) {
  return (
    <div className="flex justify-center px-4 py-8">
      <div className="w-full max-w-2xl">
        {/* Brand Header */}
        <div className="text-center mb-6">
          <h1
            className="text-4xl font-bold mb-2"
            style={{
              fontFamily: "'Reem Kufi', sans-serif",
              color: "#1F2A26",
              letterSpacing: "0.5px",
            }}
          >
            🖍️ التدرب على جدول الضرب
          </h1>
          <p
            style={{
              color: "#4B5A53",
              fontWeight: 700,
              fontSize: "0.88rem",
              fontFamily: "'Tajawal', sans-serif",
            }}
          >
            خمّن الضرب الصحيح لكل ناتج، وأكمل الاختبارات التراكمية بين المستويات
          </p>
        </div>

        {/* Stats Bar */}
        <div className="flex gap-3 justify-center mb-8 flex-wrap">
          <div
            className="px-4 py-2 rounded-2xl border-2 flex items-center gap-2"
            style={{
              borderColor: "#1F2A26",
              backgroundColor: "#FFFFFF",
              fontWeight: 700,
              fontSize: "0.9rem",
              color: "#1F2A26",
              fontFamily: "'Tajawal', sans-serif",
            }}
          >
            ⭐ نقاطي:{" "}
            <b style={{ fontSize: "1.1rem", fontFamily: "'Reem Kufi', sans-serif" }}>
              {totalPoints}
            </b>
          </div>
          <div
            className="px-4 py-2 rounded-2xl border-2 flex items-center gap-2"
            style={{
              borderColor: "#1F2A26",
              backgroundColor: "#FFFFFF",
              fontWeight: 700,
              fontSize: "0.9rem",
              color: "#1F2A26",
              fontFamily: "'Tajawal', sans-serif",
            }}
          >
            ❌ أخطاء:{" "}
            <b style={{ fontSize: "1.1rem", fontFamily: "'Reem Kufi', sans-serif" }}>
              {totalWrong}
            </b>
          </div>
        </div>

        {/* Levels Path */}
        <div className="relative px-8 py-4">
          {/* Vertical Line */}
          <div
            className="absolute right-12 top-12 bottom-12 w-1 border-r-4 border-dashed"
            style={{ borderColor: "rgba(31,42,38,0.35)" }}
          />

          {/* Levels */}
          <div className="space-y-4">
            {levels.map((level) => {
              const st = state[level.id];
              const mistakesCount = st.mistakes.length;
              const isTest = level.kind === "test";
              const colorMap: Record<string, string> = {
                yellow: "#C98A12",
                blue: "#1D6E8E",
                lilac: "#6A4FA8",
                coral: "#C8401F",
              };
              const borderColor = colorMap[level.color];

              return (
                <div
                  key={level.id}
                  className="flex items-center gap-4 relative"
                  style={{ marginBottom: isTest ? "1rem" : "0.75rem" }}
                >
                  {/* Medallion */}
                  <div
                    className="flex-shrink-0 w-20 h-20 rounded-full border-4 flex items-center justify-center cursor-pointer hover:scale-105 transition-transform relative"
                    style={{
                      borderColor,
                      backgroundColor: "#FFFFFF",
                      fontFamily: "'Reem Kufi', sans-serif",
                      fontWeight: 700,
                      fontSize: isTest ? "1.3rem" : "1.5rem",
                      color: borderColor,
                    }}
                    onClick={() => onLevelClick(level.id)}
                  >
                    {st.completed && (
                      <div
                        className="absolute -top-1 -left-1 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border-2"
                        style={{
                          backgroundColor: "#2E8B4F",
                          color: "#FFFFFF",
                          borderColor: "#FBF6E9",
                        }}
                      >
                        ✓
                      </div>
                    )}
                    {isTest ? "📝" : level.icon}
                  </div>

                  {/* Info */}
                  <div className="flex-1">
                    <h3
                      style={{
                        fontFamily: "'Reem Kufi', sans-serif",
                        fontWeight: 700,
                        fontSize: "1.08rem",
                        color: "#1F2A26",
                        margin: "0 0 2px 0",
                      }}
                    >
                      {level.name}
                    </h3>
                    <span
                      style={{
                        color: "#4B5A53",
                        fontWeight: 700,
                        fontSize: "0.83rem",
                        fontFamily: "'Tajawal', sans-serif",
                      }}
                    >
                      النتائج من {level.range}
                    </span>
                    {mistakesCount > 0 && (
                      <div
                        className="inline-block mt-1 px-2 py-1 rounded-lg cursor-pointer text-xs font-bold"
                        style={{
                          backgroundColor: "#C8401F",
                          color: "#FFFFFF",
                          fontFamily: "'Tajawal', sans-serif",
                        }}
                        onClick={() => onRetrain(level.id)}
                      >
                        إعادة تدريب على الأخطاء ({mistakesCount})
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function GameScreen({
  session,
  level,
  onToggleOption,
  onSubmit,
  onNext,
  onBack,
}: {
  session: GameSession;
  level: Level;
  onToggleOption: (idx: number) => void;
  onSubmit: () => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const total = session.queue.length;
  const qNum = Math.min(session.index + 1, total);

  const colorMap: Record<string, string> = {
    yellow: "#C98A12",
    blue: "#1D6E8E",
    lilac: "#6A4FA8",
    coral: "#C8401F",
  };

  const correctIdxArray = session.currentOptions
    .map((o, i) => (o.correct ? i : null))
    .filter((i) => i !== null) as number[];
  const correctIdx = new Set(correctIdxArray);

  const correctSelected =
    correctIdx.size === session.selected.size &&
    correctIdxArray.every((i) => session.selected.has(i));

  return (
    <div className="flex justify-center px-4 py-8">
      <div className="w-full max-w-2xl">
        <div
          className="rounded-3xl p-8"
          style={{
            backgroundColor: "#FFFFFF",
            border: "2px solid #1F2A26",
          }}
        >
          {/* Progress */}
          <div
            style={{
              fontSize: "0.85rem",
              fontWeight: 700,
              color: "#4B5A53",
              marginBottom: "1rem",
              fontFamily: "'Tajawal', sans-serif",
            }}
          >
            سؤال {qNum} من {total} — {session.isRetrain ? "تدريب على الأخطاء" : level.name}
          </div>

          {/* Target Circle */}
          <div
            className="w-40 h-40 rounded-full mx-auto mb-6 flex items-center justify-center"
            style={{
              border: "5px solid #C98A12",
              backgroundColor: "#F1E9D2",
              fontFamily: "'Reem Kufi', sans-serif",
              fontWeight: 700,
              fontSize: "3.6rem",
              color: "#1F2A26",
            }}
          >
            {session.currentTarget}
          </div>

          {/* Hint */}
          <div
            style={{
              color: "#4B5A53",
              fontWeight: 700,
              fontSize: "0.85rem",
              marginBottom: "1rem",
              fontFamily: "'Tajawal', sans-serif",
              textAlign: "center",
            }}
          >
            اختر كل عمليات الضرب التي تعطي هذا الناتج (قد يكون أكثر من إجابة صحيحة)
          </div>

          {/* Options Grid */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            {session.currentOptions.map((o, i) => {
              let bgColor = "#F1E9D2";
              let borderColor = "#1F2A26";
              let textColor = "#1F2A26";

              if (session.selected.has(i) && !session.answered) {
                bgColor = "#FBEBC9";
                borderColor = "#C98A12";
              }

              if (session.answered) {
                if (o.correct) {
                  bgColor = "#DEF3E3";
                  borderColor = "#2E8B4F";
                  textColor = "#2E8B4F";
                } else if (session.selected.has(i)) {
                  bgColor = "#FBDFD6";
                  borderColor = "#C8401F";
                  textColor = "#C8401F";
                }
              }

              return (
                <div
                  key={i}
                  className="p-4 rounded-2xl border-4 text-center cursor-pointer transition-all"
                  style={{
                    backgroundColor: bgColor,
                    borderColor,
                    color: textColor,
                    fontFamily: "'Reem Kufi', sans-serif",
                    fontWeight: 700,
                    fontSize: "1.35rem",
                    opacity: session.answered ? 1 : 1,
                    pointerEvents: session.answered ? "none" : "auto",
                  }}
                  onClick={() => onToggleOption(i)}
                >
                  {o.da} × {o.db}
                </div>
              );
            })}
          </div>

          {/* Feedback */}
          {session.answered && (
            <div
              style={{
                marginBottom: "1rem",
                fontSize: "0.98rem",
                fontWeight: 800,
                fontFamily: "'Tajawal', sans-serif",
                color: correctSelected ? "#2E8B4F" : "#C8401F",
                textAlign: "center",
              }}
            >
              {correctSelected ? (
                <>✅ صحيح! +10 نقاط</>
              ) : (
                <>
                  ❌ خطأ — الإجابة الصحيحة:{" "}
                  {session.currentOptions
                    .filter((o) => o.correct)
                    .map((o) => `${o.da} × ${o.db}`)
                    .join("   ،   ")}
                </>
              )}
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3 justify-center mb-4">
            {session.answered ? (
              <Button
                onClick={onNext}
                style={{
                  backgroundColor: "#C98A12",
                  color: "#FFFFFF",
                  fontWeight: 800,
                  borderRadius: "14px",
                  padding: "12px 22px",
                  fontSize: "0.95rem",
                  fontFamily: "'Tajawal', sans-serif",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                التالي ▶
              </Button>
            ) : (
              <Button
                onClick={onSubmit}
                disabled={session.selected.size === 0}
                style={{
                  backgroundColor: session.selected.size === 0 ? "#F1E9D2" : "#C98A12",
                  color: session.selected.size === 0 ? "#4B5A53" : "#FFFFFF",
                  fontWeight: 800,
                  borderRadius: "14px",
                  padding: "12px 22px",
                  fontSize: "0.95rem",
                  fontFamily: "'Tajawal', sans-serif",
                  border: "none",
                  cursor: session.selected.size === 0 ? "not-allowed" : "pointer",
                }}
              >
                تأكيد الإجابة
              </Button>
            )}
          </div>

          {/* Back Link */}
          <div
            className="text-center text-sm font-bold cursor-pointer underline"
            style={{
              color: "#4B5A53",
              fontFamily: "'Tajawal', sans-serif",
              marginTop: "1rem",
            }}
            onClick={onBack}
          >
            ⟵ رجوع للقائمة الرئيسية
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryScreen({
  session,
  level,
  state,
  nextLevel,
  onRetrain,
  onContinue,
  onBack,
}: {
  session: GameSession;
  level: Level;
  state: LevelState;
  nextLevel: Level | undefined;
  onRetrain: () => void;
  onContinue: (id: string) => void;
  onBack: () => void;
}) {
  const mistakesCount = state.mistakes.length;

  return (
    <div className="flex justify-center px-4 py-8">
      <div className="w-full max-w-2xl">
        <div
          className="rounded-3xl p-8"
          style={{
            backgroundColor: "#FFFFFF",
            border: "2px solid #1F2A26",
            textAlign: "center",
          }}
        >
          <h2
            style={{
              fontFamily: "'Reem Kufi', sans-serif",
              fontWeight: 700,
              color: "#1F2A26",
              marginTop: 0,
              fontSize: "1.8rem",
            }}
          >
            {session.isRetrain ? "🔁 انتهى التدريب على الأخطاء" : "🎉 أتممت " + level.name}
          </h2>

          {/* Summary Grid */}
          <div className="flex justify-center gap-6 my-6 flex-wrap">
            <div>
              <b
                style={{
                  display: "block",
                  fontFamily: "'Reem Kufi', sans-serif",
                  fontWeight: 700,
                  fontSize: "1.6rem",
                  color: "#1F2A26",
                }}
              >
                {session.correct}
              </b>
              <span
                style={{
                  fontSize: "0.8rem",
                  fontWeight: 700,
                  color: "#4B5A53",
                  fontFamily: "'Tajawal', sans-serif",
                }}
              >
                إجابات صحيحة
              </span>
            </div>

            <div>
              <b
                style={{
                  display: "block",
                  fontFamily: "'Reem Kufi', sans-serif",
                  fontWeight: 700,
                  fontSize: "1.6rem",
                  color: "#1F2A26",
                }}
              >
                {session.wrong}
              </b>
              <span
                style={{
                  fontSize: "0.8rem",
                  fontWeight: 700,
                  color: "#4B5A53",
                  fontFamily: "'Tajawal', sans-serif",
                }}
              >
                إجابات خاطئة
              </span>
            </div>

            <div>
              <b
                style={{
                  display: "block",
                  fontFamily: "'Reem Kufi', sans-serif",
                  fontWeight: 700,
                  fontSize: "1.6rem",
                  color: "#1F2A26",
                }}
              >
                +{session.pointsEarned}
              </b>
              <span
                style={{
                  fontSize: "0.8rem",
                  fontWeight: 700,
                  color: "#4B5A53",
                  fontFamily: "'Tajawal', sans-serif",
                }}
              >
                نقاط في هذه الجولة
              </span>
            </div>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 justify-center flex-wrap mb-4">
            {mistakesCount > 0 && (
              <Button
                onClick={onRetrain}
                style={{
                  backgroundColor: "#FFFFFF",
                  color: "#1F2A26",
                  border: "2px solid #1F2A26",
                  fontWeight: 800,
                  borderRadius: "14px",
                  padding: "12px 22px",
                  fontSize: "0.95rem",
                  fontFamily: "'Tajawal', sans-serif",
                  cursor: "pointer",
                }}
              >
                إعادة تدريب على الأخطاء ({mistakesCount})
              </Button>
            )}

            {nextLevel && (
              <Button
                onClick={() => onContinue(nextLevel.id)}
                style={{
                  backgroundColor: "#C98A12",
                  color: "#FFFFFF",
                  fontWeight: 800,
                  borderRadius: "14px",
                  padding: "12px 22px",
                  fontSize: "0.95rem",
                  fontFamily: "'Tajawal', sans-serif",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                الاستمرار ← {nextLevel.name} ▶
              </Button>
            )}
          </div>

          {/* Back Link */}
          <div
            className="text-center text-sm font-bold cursor-pointer underline"
            style={{
              color: "#4B5A53",
              fontFamily: "'Tajawal', sans-serif",
              marginTop: "1rem",
            }}
            onClick={onBack}
          >
            ⟵ رجوع للقائمة الرئيسية
          </div>
        </div>
      </div>
    </div>
  );
}
