import React, { useState, useRef, useEffect } from "react";
import { 
  Play, 
  Pause, 
  Square, 
  Volume2, 
  VolumeX, 
  Download, 
  Sparkles, 
  RefreshCw, 
  Check, 
  HelpCircle, 
  Sliders, 
  Mic, 
  Radio, 
  SlidersHorizontal,
  FileAudio,
  AlertCircle,
  Scissors,
  Upload,
  Trash2,
  FileText,
  DownloadCloud,
  Plus,
  RefreshCcw,
  History,
  Save,
  Music,
  Zap,
  Timer,
  Share2,
  Link,
  Undo2,
  Pencil,
  Eye
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import JSZip from "jszip";
// @ts-ignore
import lamejs from "lamejs";

// Miniature responsive waveform component for side-by-side active visual comparison
const MiniWaveformCompare = ({ 
  buffer, 
  title, 
  isActive, 
  onClick 
}: { 
  buffer: AudioBuffer | null, 
  title: string, 
  isActive: boolean, 
  onClick: () => void 
}) => {
  if (!buffer) return null;
  
  const data = buffer.getChannelData(0);
  const peaksCount = 120;
  const step = Math.floor(data.length / peaksCount) || 1;
  const peaks: number[] = [];
  
  for (let i = 0; i < peaksCount; i++) {
    const start = i * step;
    let max = 0;
    for (let j = 0; j < step && (start + j) < data.length; j++) {
      const val = Math.abs(data[start + j]);
      if (val > max) max = val;
    }
    peaks.push(max);
  }
  
  return (
    <div 
      onClick={onClick}
      className={`p-3 bg-[#0B0C0E]/90 border rounded-lg flex flex-col gap-1.5 transition-all cursor-pointer select-none group ${
        isActive 
          ? "border-[#4ADE80] bg-[#4ADE80]/5 shadow-[0_0_12px_rgba(74,222,128,0.15)]" 
          : "border-[#2D3036] hover:border-[#5C616A]"
      }`}
    >
      <div className="flex items-center justify-between text-[9px] font-mono uppercase tracking-wider">
        <span className={isActive ? "text-[#4ADE80] font-bold" : "text-[#8E9299]"}>
          {title}
        </span>
        <span className="text-[#5C616A] font-medium">
          {buffer.duration.toFixed(2)}s | {(buffer.length / 1000).toFixed(0)}k Smp
        </span>
      </div>
      <div className="h-8 flex items-center gap-[1px] pt-1">
        {peaks.map((p, idx) => {
          const heightPercent = Math.max(8, Math.min(100, Math.round(p * 100)));
          return (
            <div 
              key={idx}
              style={{ height: `${heightPercent}%` }}
              className={`flex-1 rounded-sm transition-all duration-300 ${
                isActive 
                  ? "bg-[#4ADE80] opacity-90 shadow-[0_0_4px_rgba(74,222,128,0.3)]" 
                  : "bg-[#5C616A] opacity-40 group-hover:bg-[#8E9299]"
              }`}
            />
          );
        })}
      </div>
    </div>
  );
};

// Pre-defined script requested by the user
const DEFAULT_SCRIPT = `Engineering teams at mid-market companies deploy frequently. Typically, with 50 to 500 engineers. However, they often operate without critical visibility.
Today, deployment incidents are correlated manually. This happens hours after a failure occurs, leading to prolonged downtime.

Decisions are often based on 'gut-feel', rather than historical data. Meanwhile, DORA metrics remain trapped in static, quarterly spreadsheets. Worst of all, supply chain vulnerabilities allow malicious packages to steal credentials during CI/CD. All of this happens without leaving a trace.`;

// Interface for Bulk Script Manager
interface BulkItem {
  id: string;
  text: string;
  voiceName: string;
  toneDescription: string;
  status: "idle" | "generating" | "completed" | "failed";
  error?: string;
  base64Audio?: string;
  audioBuffer?: AudioBuffer | null;
  duration?: number;
  progressText?: string;
}

// Interface for Recent Voice Configurations
interface VoiceConfig {
  id: string;
  voiceName: string;
  toneDescription: string;
  pitchShift: number;
  timestamp: number;
}

// Interface for Word-per-minute (WPM) Sync Script Segment
interface SyncAnalysisSegment {
  text: string;
  startTime: number;
  endTime: number;
  duration: number;
  wordCount: number;
  wpm: number;
  deviation: number;
  status: "fast" | "slow" | "normal";
}

// Interactive / real peaks-based micro-waveform for Bulk Item preview
const BulkItemWaveform = React.memo(({ buffer }: { buffer: AudioBuffer | null | undefined }) => {
  const peaks = React.useMemo(() => {
    if (!buffer) return Array(24).fill(0.15);
    try {
      const channelData = buffer.getChannelData(0);
      const step = Math.floor(channelData.length / 24) || 1;
      const result: number[] = [];
      for (let i = 0; i < 24; i++) {
        let max = 0;
        const start = i * step;
        const end = Math.min(start + step, channelData.length);
        for (let j = start; j < end; j++) {
          const val = Math.abs(channelData[j]);
          if (val > max) max = val;
        }
        result.push(max);
      }
      const maxPeak = Math.max(...result);
      if (maxPeak > 0) {
        return result.map(p => (p / maxPeak) * 0.85 + 0.15); // min 15% height
      }
      return Array(24).fill(0.15);
    } catch {
      return Array(24).fill(0.15);
    }
  }, [buffer]);

  return (
    <div className="w-[100px] h-6 flex items-end justify-between gap-[2px] px-1.5 py-[3px] bg-[#090A0C] border border-[#2D3036]/50 rounded group/wave hover:border-[#4ADE80]/30 transition-all select-none">
      {peaks.map((p, i) => (
        <div
          key={i}
          className="flex-grow bg-emerald-500/30 group-hover/wave:bg-[#4ADE80]/70 rounded-[1px] transition-all"
          style={{ height: `${p * 100}%` }}
        />
      ))}
    </div>
  );
});

// Robust CSV Parser
const parseCSV = (csvText: string): { text: string; voiceName?: string; toneDescription?: string }[] => {
  const result: { text: string; voiceName?: string; toneDescription?: string }[] = [];
  
  // Clean double-quotes and split lines safely
  const lines: string[] = [];
  let currentLine = "";
  let inQuotes = false;
  
  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    if (char === '"') {
      inQuotes = !inQuotes;
      currentLine += char;
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (currentLine.trim()) {
        lines.push(currentLine);
      }
      currentLine = "";
    } else {
      currentLine += char;
    }
  }
  if (currentLine.trim()) {
    lines.push(currentLine);
  }

  if (lines.length === 0) return [];

  // Parse header
  const parseCSVLine = (line: string): string[] => {
    const cells: string[] = [];
    let cell = "";
    let insideQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        insideQuotes = !insideQuotes;
      } else if (char === ',' && !insideQuotes) {
        cells.push(cell.trim().replace(/^"|"$/g, "").replace(/""/g, '"'));
        cell = "";
      } else {
        cell += char;
      }
    }
    cells.push(cell.trim().replace(/^"|"$/g, "").replace(/""/g, '"'));
    return cells;
  };

  const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim());
  const hasHeaders = headers.includes("text") || headers.includes("script");
  
  const textIdx = headers.indexOf("text") !== -1 ? headers.indexOf("text") : headers.indexOf("script");
  const voiceIdx = headers.indexOf("voice") !== -1 ? headers.indexOf("voice") : headers.indexOf("voice_name");
  const toneIdx = headers.indexOf("tone") !== -1 ? headers.indexOf("tone") : headers.indexOf("tone_description");

  const startIndex = hasHeaders ? 1 : 0;

  for (let i = startIndex; i < lines.length; i++) {
    const cells = parseCSVLine(lines[i]);
    if (cells.length === 0 || !cells[0]) continue;

    if (hasHeaders) {
      const textVal = cells[textIdx];
      if (textVal) {
        result.push({
          text: textVal,
          voiceName: voiceIdx !== -1 && cells[voiceIdx] ? cells[voiceIdx] : undefined,
          toneDescription: toneIdx !== -1 && cells[toneIdx] ? cells[toneIdx] : undefined,
        });
      }
    } else {
      // First column text, second voice, third tone
      result.push({
        text: cells[0],
        voiceName: cells[1] || undefined,
        toneDescription: cells[2] || undefined,
      });
    }
  }

  return result;
};

// Voice configurations matching gemini-3.1-flash-tts-preview support
interface PrebuiltVoice {
  name: string;
  gender: "Male" | "Female" | "Neutral";
  description: string;
  recommendedFor: string;
}

const VOICES: PrebuiltVoice[] = [
  { 
    name: "Charon", 
    gender: "Male", 
    description: "Warm, resonant, deep medium-low tone.", 
    recommendedFor: "Dry corporate announcements & technical explanations" 
  },
  { 
    name: "Fenrir", 
    gender: "Male", 
    description: "Deep, commanding baritone tone.", 
    recommendedFor: "Dramatic voiceovers, trailers & deep narratives" 
  },
  { 
    name: "Zephyr", 
    gender: "Neutral", 
    description: "Smooth, balanced, modern-neutral tone.", 
    recommendedFor: "Standard documentation reads & professional briefs" 
  },
  { 
    name: "Puck", 
    gender: "Male", 
    description: "Crisp, clean, energetic, medium-high tone.", 
    recommendedFor: "Upbeat messages, ads & bright explainers" 
  },
  { 
    name: "Kore", 
    gender: "Female", 
    description: "Clear, cheerful, brightly spoken tone.", 
    recommendedFor: "Friendly instructions, upbeat dialogues & guides" 
  }
];

// Interactive EQ Frequency Response Curve Component for DSP Rack
interface InteractiveEQCurveProps {
  bassBoost: number;
  setBassBoost: (val: number) => void;
  trebleBoost: number;
  setTrebleBoost: (val: number) => void;
}

function InteractiveEQCurve({
  bassBoost,
  setBassBoost,
  trebleBoost,
  setTrebleBoost
}: InteractiveEQCurveProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [activeDrag, setActiveDrag] = useState<"bass" | "treble" | null>(null);

  const width = 450;
  const height = 150;
  const paddingY = 15;
  const centerY = height / 2;
  const maxDb = 15;
  const scaleY = (centerY - paddingY) / maxDb; // pixels per dB

  // X coordinate calculation from frequency (20Hz to 20kHz)
  const getXForFreq = (freq: number) => {
    const minF = 20;
    const maxF = 20000;
    const logMin = Math.log10(minF);
    const logMax = Math.log10(maxF);
    const logVal = Math.log10(freq);
    return ((logVal - logMin) / (logMax - logMin)) * width;
  };

  // Freq calculation from X coordinate
  const getFreqForX = (x: number) => {
    const minF = 20;
    const maxF = 20000;
    const logMin = Math.log10(minF);
    const logMax = Math.log10(maxF);
    const ratio = x / width;
    const logVal = logMin + ratio * (logMax - logMin);
    return Math.pow(10, logVal);
  };

  // Calculate dB gain at a specific frequency
  const getGainAtFreq = (freq: number) => {
    const bassGain = bassBoost / (1 + Math.pow(freq / 180, 2.0));
    const trebleGain = trebleBoost / (1 + Math.pow(3200 / freq, 2.0));
    return bassGain + trebleGain;
  };

  const getYForDb = (db: number) => {
    return centerY - db * scaleY;
  };

  const getDbForY = (y: number) => {
    const db = (centerY - y) / scaleY;
    return Math.max(-12, Math.min(12, Math.round(db)));
  };

  // Build the curve path
  const points: string[] = [];
  const steps = 120;
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * width;
    const freq = getFreqForX(x);
    const gain = getGainAtFreq(freq);
    const y = getYForDb(gain);
    points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  const pathD = `M ${points.join(" L ")}`;
  const areaD = `M 0,${height} L ${points.join(" L ")} L ${width},${height} Z`;

  // Handle pointer down to start dragging
  const handlePointerDown = (e: React.PointerEvent<SVGElement>, type: "bass" | "treble") => {
    e.preventDefault();
    setActiveDrag(type);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  // Handle pointer move to track drag
  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!activeDrag) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clientY = e.clientY - rect.top;
    const relativeY = (clientY / rect.height) * height;
    const db = getDbForY(relativeY);
    if (activeDrag === "bass") {
      setBassBoost(db);
    } else {
      setTrebleBoost(db);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (activeDrag) {
      e.currentTarget.releasePointerCapture(e.pointerId);
      setActiveDrag(null);
    }
  };

  // Frequencies for vertical lines
  const gridFreqs = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
  const gridDbs = [12, 6, 0, -6, -12];

  // Specific control frequencies
  const bassFreq = 180;
  const trebleFreq = 3200;

  const bassX = getXForFreq(bassFreq);
  const bassY = getYForDb(getGainAtFreq(bassFreq));

  const trebleX = getXForFreq(trebleFreq);
  const trebleY = getYForDb(getGainAtFreq(trebleFreq));

  return (
    <div className="space-y-3">
      {/* Visual Response Plot */}
      <div className="relative bg-[#060709] border border-[#2D3036]/60 rounded p-2 overflow-hidden select-none">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto cursor-ns-resize touch-none"
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <defs>
            {/* Background glowing gradients */}
            <linearGradient id="eq-glow-grad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.12" />
              <stop offset="100%" stopColor="#F59E0B" stopOpacity="0.00" />
            </linearGradient>
            <linearGradient id="eq-line-grad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#EAB308" />
              <stop offset="100%" stopColor="#F59E0B" />
            </linearGradient>
          </defs>

          {/* Grid lines: DB level lines */}
          {gridDbs.map((db) => {
            const y = getYForDb(db);
            return (
              <g key={db}>
                <line
                  x1="0"
                  y1={y}
                  x2={width}
                  y2={y}
                  stroke={db === 0 ? "#2D3036" : "#14161B"}
                  strokeWidth={db === 0 ? "1.5" : "1"}
                  strokeDasharray={db === 0 ? "" : "3,3"}
                />
                <text
                  x="6"
                  y={y - 4}
                  fill={db === 0 ? "#8E9299" : "#474C54"}
                  className="font-mono text-[8px] font-bold"
                >
                  {db > 0 ? `+${db}` : db} dB
                </text>
              </g>
            );
          })}

          {/* Grid lines: Frequency markers */}
          {gridFreqs.map((freq) => {
            const x = getXForFreq(freq);
            return (
              <g key={freq}>
                <line
                  x1={x}
                  y1="0"
                  x2={x}
                  y2={height}
                  stroke="#121418"
                  strokeWidth="1"
                  strokeDasharray="2,2"
                />
                <text
                  x={x}
                  y={height - 5}
                  fill="#474C54"
                  className="font-mono text-[7px] text-center"
                  textAnchor="middle"
                >
                  {freq >= 1000 ? `${freq / 1000}k` : freq}Hz
                </text>
              </g>
            );
          })}

          {/* Area fill under curve */}
          <path d={areaD} fill="url(#eq-glow-grad)" />

          {/* Main response curve line */}
          <path
            d={pathD}
            fill="none"
            stroke="url(#eq-line-grad)"
            strokeWidth="2.5"
            strokeLinecap="round"
          />

          {/* Low shelf control region guideline */}
          <line
            x1={bassX}
            y1="0"
            x2={bassX}
            y2={height}
            stroke="#F59E0B"
            strokeWidth="1"
            strokeOpacity="0.12"
            strokeDasharray="4,4"
          />

          {/* High shelf control region guideline */}
          <line
            x1={trebleX}
            y1="0"
            x2={trebleX}
            y2={height}
            stroke="#F59E0B"
            strokeWidth="1"
            strokeOpacity="0.12"
            strokeDasharray="4,4"
          />

          {/* Bass Interactive Handle */}
          <g
            className="group cursor-ns-resize touch-none"
            onPointerDown={(e) => handlePointerDown(e, "bass")}
          >
            <circle
              cx={bassX}
              cy={bassY}
              r="14"
              fill="transparent"
              className="cursor-ns-resize"
            />
            <circle
              cx={bassX}
              cy={bassY}
              r="7"
              fill="#060709"
              stroke="#EAB308"
              strokeWidth="2.5"
              className={`transition-all duration-700 ${
                activeDrag === "bass" ? "stroke-yellow-400" : "group-hover:scale-110"
              }`}
            />
            <text
              x={bassX}
              y={bassY < 32 ? bassY + 16 : bassY - 10}
              fill="#EAB308"
              className="font-mono text-[8px] font-bold"
              textAnchor="middle"
            >
              BASS {bassBoost > 0 ? `+${bassBoost}` : bassBoost}dB
            </text>
          </g>

          {/* Treble Interactive Handle */}
          <g
            className="group cursor-ns-resize touch-none"
            onPointerDown={(e) => handlePointerDown(e, "treble")}
          >
            <circle
              cx={trebleX}
              cy={trebleY}
              r="14"
              fill="transparent"
              className="cursor-ns-resize"
            />
            <circle
              cx={trebleX}
              cy={trebleY}
              r="7"
              fill="#060709"
              stroke="#F59E0B"
              strokeWidth="2.5"
              className={`transition-all duration-700 ${
                activeDrag === "treble" ? "stroke-amber-400" : "group-hover:scale-110"
              }`}
            />
            <text
              x={trebleX}
              y={trebleY < 32 ? trebleY + 16 : trebleY - 10}
              fill="#F59E0B"
              className="font-mono text-[8px] font-bold"
              textAnchor="middle"
            >
              TREBLE {trebleBoost > 0 ? `+${trebleBoost}` : trebleBoost}dB
            </text>
          </g>
        </svg>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between text-[8.5px] font-mono text-[#5C616A] leading-relaxed gap-1 px-0.5 select-none">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-yellow-500/20 border border-yellow-500/60" />
          Low-Shelf Vocal Warmth: <strong className="text-yellow-400 font-bold">{bassBoost > 0 ? `+${bassBoost}` : bassBoost} dB</strong> (180 Hz)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500/20 border border-amber-500/60" />
          High-Shelf Vocal Air & Presence: <strong className="text-amber-400 font-bold">{trebleBoost > 0 ? `+${trebleBoost}` : trebleBoost} dB</strong> (3.2 kHz)
        </span>
      </div>
    </div>
  );
}

export default function App() {
  const [text, setText] = useState<string>(() => {
    try {
      return localStorage.getItem("studio_text") || DEFAULT_SCRIPT;
    } catch (e) {
      return DEFAULT_SCRIPT;
    }
  });
  const [selectedVoice, setSelectedVoice] = useState<string>(() => {
    try {
      return localStorage.getItem("studio_selected_voice") || "Charon";
    } catch (e) {
      return "Charon";
    }
  });
  const [toneDescription, setToneDescription] = useState<string>(() => {
    try {
      return localStorage.getItem("studio_tone_description") || 
        "completely dry recording studio format, medium-low tone, consistent rhythm with varied vocal cadence, introducing natural minor pauses and subtle shifts in speaking speed to enhance realism";
    } catch (e) {
      return "completely dry recording studio format, medium-low tone, consistent rhythm with varied vocal cadence, introducing natural minor pauses and subtle shifts in speaking speed to enhance realism";
    }
  });
  
  const [autoSaveText, setAutoSaveText] = useState<boolean>(() => {
    try {
      return localStorage.getItem("studio_autosave_enabled") !== "false";
    } catch (e) {
      return true;
    }
  });
  
  // Audio state
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [base64Audio, setBase64Audio] = useState<string | null>(null);
  const [isExportingMp3, setIsExportingMp3] = useState<boolean>(false);
  const [mp3ExportProgress, setMp3ExportProgress] = useState<number>(0);
  const [exportFormat, setExportFormat] = useState<"wav" | "mp3" | "ogg">("wav");
  const [isExportingOgg, setIsExportingOgg] = useState<boolean>(false);
  const [oggExportProgress, setOggExportProgress] = useState<number>(0);
  
  // Side-by-Side Comparison states
  const [isComparisonMode, setIsComparisonMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem("studio_is_comparison_mode") === "true";
    } catch (e) {
      return false;
    }
  });
  const [comparisonVoiceA, setComparisonVoiceA] = useState<string>(() => {
    try {
      return localStorage.getItem("studio_comparison_voice_a") || "Charon";
    } catch (e) {
      return "Charon";
    }
  });
  const [comparisonVoiceB, setComparisonVoiceB] = useState<string>(() => {
    try {
      return localStorage.getItem("studio_comparison_voice_b") || "Fenrir";
    } catch (e) {
      return "Fenrir";
    }
  });
  const [activeComparisonSlot, setActiveComparisonSlot] = useState<"A" | "B">("A");
  const [audioA, setAudioA] = useState<string | null>(null);
  const [audioB, setAudioB] = useState<string | null>(null);
  const [audioBufferA, setAudioBufferA] = useState<AudioBuffer | null>(null);
  const [audioBufferB, setAudioBufferB] = useState<AudioBuffer | null>(null);
  const [silenceReportA, setSilenceReportA] = useState<{
    leadingMs: number;
    trailingMs: number;
    originalDuration: number;
    trimmedDuration: number;
  } | null>(null);
  const [silenceReportB, setSilenceReportB] = useState<{
    leadingMs: number;
    trailingMs: number;
    originalDuration: number;
    trimmedDuration: number;
  } | null>(null);
  const [activePlaySlot, setActivePlaySlot] = useState<"A" | "B">("A");
  const [generationStage, setGenerationStage] = useState<"idle" | "voiceA" | "voiceB">("idle");

  // Recent Voice Configurations states
  const [recentConfigs, setRecentConfigs] = useState<VoiceConfig[]>(() => {
    try {
      const saved = localStorage.getItem("studio_recent_configs");
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
  const [recallNotification, setRecallNotification] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem("studio_recent_configs", JSON.stringify(recentConfigs));
    } catch (e) {
      console.warn("localStorage sync error:", e);
    }
  }, [recentConfigs]);

  const saveVoiceConfig = (voiceName: string, tone: string, pitch: number) => {
    setRecentConfigs(prev => {
      const cleaned = prev.filter(c => 
        !(c.voiceName === voiceName && c.toneDescription === tone && c.pitchShift === pitch)
      );
      const newConfig: VoiceConfig = {
        id: Math.random().toString(36).substring(2, 11),
        voiceName,
        toneDescription: tone,
        pitchShift: pitch,
        timestamp: Date.now()
      };
      return [newConfig, ...cleaned].slice(0, 5);
    });
  };

  const handleLoadConfig = (config: VoiceConfig) => {
    if (isComparisonMode) {
      if (activeComparisonSlot === "A") {
        setComparisonVoiceA(config.voiceName);
      } else {
        setComparisonVoiceB(config.voiceName);
      }
    } else {
      setSelectedVoice(config.voiceName);
    }
    setToneDescription(config.toneDescription);
    handlePitchChange(config.pitchShift);

    setRecallNotification(`Recalled: ${config.voiceName} (${config.pitchShift >= 0 ? "+" : ""}${config.pitchShift}% Pitch)`);
    setTimeout(() => {
      setRecallNotification(null);
    }, 2500);
  };

  // Sync to localStorage effects
  useEffect(() => {
    if (!autoSaveText) return;
    try {
      localStorage.setItem("studio_text", text);
    } catch (e) {
      console.warn("localStorage sync error:", e);
    }
  }, [text, autoSaveText]);

  useEffect(() => {
    try {
      localStorage.setItem("studio_autosave_enabled", String(autoSaveText));
    } catch (e) {
      console.warn("localStorage sync error:", e);
    }
  }, [autoSaveText]);

  useEffect(() => {
    try {
      localStorage.setItem("studio_selected_voice", selectedVoice);
    } catch (e) {
      console.warn("localStorage sync error:", e);
    }
  }, [selectedVoice]);

  useEffect(() => {
    try {
      localStorage.setItem("studio_tone_description", toneDescription);
    } catch (e) {
      console.warn("localStorage sync error:", e);
    }
  }, [toneDescription]);

  useEffect(() => {
    try {
      localStorage.setItem("studio_is_comparison_mode", String(isComparisonMode));
    } catch (e) {
      console.warn("localStorage sync error:", e);
    }
  }, [isComparisonMode]);

  useEffect(() => {
    try {
      localStorage.setItem("studio_comparison_voice_a", comparisonVoiceA);
    } catch (e) {
      console.warn("localStorage sync error:", e);
    }
  }, [comparisonVoiceA]);

  useEffect(() => {
    try {
      localStorage.setItem("studio_comparison_voice_b", comparisonVoiceB);
    } catch (e) {
      console.warn("localStorage sync error:", e);
    }
  }, [comparisonVoiceB]);

  // Playback control states
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(0.8);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [pitchShift, setPitchShift] = useState<number>(0);
  const [normalizeAudio, setNormalizeAudio] = useState<boolean>(false);
  const [fadeInDuration, setFadeInDuration] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("studio_fade_in_duration");
      return saved ? parseFloat(saved) : 0.05;
    } catch {
      return 0.05;
    }
  });
  const [fadeOutDuration, setFadeOutDuration] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("studio_fade_out_duration");
      return saved ? parseFloat(saved) : 0.05;
    } catch {
      return 0.05;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("studio_fade_in_duration", String(fadeInDuration));
    } catch (e) {
      console.warn("localStorage sync error:", e);
    }
  }, [fadeInDuration]);

  useEffect(() => {
    try {
      localStorage.setItem("studio_fade_out_duration", String(fadeOutDuration));
    } catch (e) {
      console.warn("localStorage sync error:", e);
    }
  }, [fadeOutDuration]);
  const [trimSilence, setTrimSilence] = useState<boolean>(false);
  const [silenceReport, setSilenceReport] = useState<{
    leadingMs: number;
    trailingMs: number;
    originalDuration: number;
    trimmedDuration: number;
  } | null>(null);
  const [audioPeakDb, setAudioPeakDb] = useState<number>(-Infinity);
  const [audioDuration, setAudioDuration] = useState<number>(0);
  const [trimStartRatio, setTrimStartRatio] = useState<number>(0);
  const [trimEndRatio, setTrimEndRatio] = useState<number>(1);
  const [activeDragHandle, setActiveDragHandle] = useState<"start" | "end" | null>(null);

  useEffect(() => {
    setTrimStartRatio(0);
    setTrimEndRatio(1);
  }, [base64Audio]);

  const [currentTime, setCurrentTime] = useState<number>(0);
  const [playbackProgress, setPlaybackProgress] = useState<number>(0);
  const [waveformZoom, setWaveformZoom] = useState<number>(1);
  const [waveformPan, setWaveformPan] = useState<number>(0);

  // Word-per-minute (WPM) Sync Script States
  const [syncSegments, setSyncSegments] = useState<SyncAnalysisSegment[]>([]);
  const [isSynced, setIsSynced] = useState<boolean>(false);
  const [averageWpm, setAverageWpm] = useState<number>(0);
  const [targetWpm, setTargetWpm] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("studio_target_wpm");
      return saved ? parseInt(saved) : 150;
    } catch (e) {
      return 150;
    }
  });

  const handleTargetWpmChange = (val: number) => {
    const clamped = Math.max(1, Math.min(500, val));
    setTargetWpm(clamped);
    try {
      localStorage.setItem("studio_target_wpm", clamped.toString());
    } catch (e) {}
  };

  // Reset sync on text or audio change to prevent stale alignments
  useEffect(() => {
    setIsSynced(false);
    setSyncSegments([]);
  }, [text, base64Audio]);

  // Audio Sharing Feature States
  const [isSharing, setIsSharing] = useState<boolean>(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState<boolean>(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [isLoadingShared, setIsLoadingShared] = useState<boolean>(false);
  const [sharedLoadError, setSharedLoadError] = useState<string | null>(null);

  // Load shared audio on mount if ?share=ID exists in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const shareId = params.get("share");
    if (shareId) {
      const fetchShared = async () => {
        setIsLoadingShared(true);
        setSharedLoadError(null);
        try {
          const res = await fetch(`/api/share/${shareId}`);
          if (!res.ok) {
            throw new Error("Shared voiceover not found or has expired.");
          }
          const data = await res.json();
          if (data.base64Audio) {
            setText(data.text || "");
            setSelectedVoice(data.voiceName || "Charon");
            setBase64Audio(data.base64Audio);
            // Allow components to initialize, then load the audio buffer
            setTimeout(() => {
              loadAudioBuffer(data.base64Audio).catch(console.error);
            }, 100);
          }
        } catch (err: any) {
          console.error("Error loading shared audio:", err);
          setSharedLoadError(err.message || "Failed to load shared voiceover.");
        } finally {
          setIsLoadingShared(false);
        }
      };
      fetchShared();
    }
  }, []);

  // Generate and copy a shareable temporary link
  const handleShareAudio = async () => {
    if (!base64Audio) return;
    setIsSharing(true);
    setShareError(null);
    setShareUrl(null);
    setCopySuccess(false);

    try {
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          base64Audio,
          text,
          voiceName: selectedVoice
        })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to generate share link.");
      }

      const { id } = await res.json();
      const generatedUrl = `${window.location.origin}${window.location.pathname}?share=${id}`;
      setShareUrl(generatedUrl);

      // Copy url to system clipboard
      await navigator.clipboard.writeText(generatedUrl);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 3000);
    } catch (err: any) {
      console.error("Error sharing audio:", err);
      setShareError(err.message || "An error occurred while creating the share link.");
    } finally {
      setIsSharing(false);
    }
  };

  // Premium Features 3 (DSP Rack) & 4 (Ambient soundscapes) States
  const [dspBassBoost, setDspBassBoost] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("studio_dsp_bass");
      return saved ? parseInt(saved) : 0;
    } catch (e) { return 0; }
  });
  const [dspTrebleBoost, setDspTrebleBoost] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("studio_dsp_treble");
      return saved ? parseInt(saved) : 0;
    } catch (e) { return 0; }
  });
  const [dspCompressorEnabled, setDspCompressorEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem("studio_dsp_compressor") === "true";
    } catch (e) { return false; }
  });
  const [dspReverbMix, setDspReverbMix] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("studio_dsp_reverb_mix");
      return saved ? parseInt(saved) : 0;
    } catch (e) { return 0; }
  });
  const [dspReverbDelayTime, setDspReverbDelayTime] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("studio_dsp_reverb_delay");
      return saved ? parseFloat(saved) : 0.12;
    } catch (e) { return 0.12; }
  });
  const [dspReverbFeedback, setDspReverbFeedback] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("studio_dsp_reverb_feedback");
      return saved ? parseInt(saved) : 25;
    } catch (e) { return 25; }
  });

  const [ambientTrack, setAmbientTrack] = useState<string>(() => {
    try {
      return localStorage.getItem("studio_ambient_track") || "none";
    } catch (e) { return "none"; }
  });
  const [ambientVolume, setAmbientVolume] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("studio_ambient_volume");
      return saved ? parseInt(saved) : 25;
    } catch (e) { return 25; }
  });
  const [autoDuckingEnabled, setAutoDuckingEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem("studio_auto_ducking");
      return saved === "true";
    } catch (e) { return false; }
  });

  const activeAmbientNodesRef = useRef<any[]>([]);
  const ambientGainNodeRef = useRef<GainNode | null>(null);

  // Sync premium features to localStorage
  useEffect(() => {
    try {
      localStorage.setItem("studio_dsp_bass", String(dspBassBoost));
      localStorage.setItem("studio_dsp_treble", String(dspTrebleBoost));
      localStorage.setItem("studio_dsp_compressor", String(dspCompressorEnabled));
      localStorage.setItem("studio_dsp_reverb_mix", String(dspReverbMix));
      localStorage.setItem("studio_dsp_reverb_delay", String(dspReverbDelayTime));
      localStorage.setItem("studio_dsp_reverb_feedback", String(dspReverbFeedback));
      localStorage.setItem("studio_ambient_track", ambientTrack);
      localStorage.setItem("studio_ambient_volume", String(ambientVolume));
      localStorage.setItem("studio_auto_ducking", String(autoDuckingEnabled));
    } catch (e) {
      console.warn("localStorage sync error:", e);
    }
  }, [dspBassBoost, dspTrebleBoost, dspCompressorEnabled, dspReverbMix, dspReverbDelayTime, dspReverbFeedback, ambientTrack, ambientVolume, autoDuckingEnabled]);

  // Adjust ambient mixer volume in real-time if the slider or ducking is toggled
  useEffect(() => {
    if (ambientGainNodeRef.current && audioCtxRef.current) {
      const ctxTime = audioCtxRef.current.currentTime;
      if (!autoDuckingEnabled) {
        const fullGain = ambientVolume / 100;
        ambientGainNodeRef.current.gain.setTargetAtTime(fullGain, ctxTime, 0.1);
      }
    }
  }, [ambientVolume, autoDuckingEnabled]);

  // Web Audio Nodes references
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const analyserNodeRef = useRef<AnalyserNode | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const startTimeRef = useRef<number>(0);
  const pausedAtRef = useRef<number>(0);
  
  // Canvas visualization ref
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Split text into paragraphs or sentences for highlighted narrative guide
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .filter(s => s.trim().length > 0);

  // Estimate reading pointer based on playback progress
  const activeSentenceIndex = isPlaying 
    ? Math.min(Math.floor((currentTime / (audioDuration || 1)) * sentences.length), sentences.length - 1)
    : -1;

  // Clean up Web Audio on unmount
  useEffect(() => {
    return () => {
      stopAudio();
      if (audioCtxRef.current) {
        audioCtxRef.current.close();
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // Update visualizer size dynamically and draw idle waves
  useEffect(() => {
    drawWaveform();
  }, [base64Audio, isPlaying, waveformZoom, waveformPan]);

  // Re-decode audio buffers when trimSilence option changes
  useEffect(() => {
    const redecode = async () => {
      if (isComparisonMode) {
        if (audioA) {
          try {
            const resA = await decodeB64ToAudioBuffer(audioA);
            setAudioBufferA(resA.buffer);
            setSilenceReportA(resA.silenceReport);
            if (activePlaySlot === "A") {
              audioBufferRef.current = resA.buffer;
              setSilenceReport(resA.silenceReport);
              setAudioDuration(resA.buffer.duration);
              setAudioPeakDb(resA.peakDb);
            }
          } catch (e) {
            console.error("Error re-decoding A:", e);
          }
        }
        if (audioB) {
          try {
            const resB = await decodeB64ToAudioBuffer(audioB);
            setAudioBufferB(resB.buffer);
            setSilenceReportB(resB.silenceReport);
            if (activePlaySlot === "B") {
              audioBufferRef.current = resB.buffer;
              setSilenceReport(resB.silenceReport);
              setAudioDuration(resB.buffer.duration);
              setAudioPeakDb(resB.peakDb);
            }
          } catch (e) {
            console.error("Error re-decoding B:", e);
          }
        }
      } else {
        if (base64Audio) {
          loadAudioBuffer(base64Audio);
        }
      }
    };
    redecode();
  }, [trimSilence]);

  // Helper to calculate normalization gain factor (reaches -1.0dB target)
  const getNormalizationFactor = (): number => {
    if (!base64Audio || audioPeakDb === -Infinity) return 1.0;
    const peakFloat = Math.pow(10, audioPeakDb / 20);
    const targetLevel = Math.pow(10, -1.0 / 20); // -1.0dB = ~0.89125
    return peakFloat > 0 ? targetLevel / peakFloat : 1.0;
  };

  // Adjust volume dynamically if nodes are already playing
  useEffect(() => {
    if (gainNodeRef.current) {
      let playGain = isMuted ? 0 : volume;
      if (normalizeAudio) {
        playGain = playGain * getNormalizationFactor();
      }
      gainNodeRef.current.gain.value = playGain;
    }
  }, [volume, isMuted, normalizeAudio, audioPeakDb, base64Audio]);

  // Pure decoder function to avoid inline side effects during consecutive loads
  const decodeB64ToAudioBuffer = async (b64Data: string) => {
    // Decode base64 16-bit PCM (24000Hz mono)
    const binaryString = window.atob(b64Data);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    let int16Array = new Int16Array(bytes.buffer);
    const originalLength = int16Array.length;
    let startOffset = 0;
    let endOffset = int16Array.length;

    if (trimSilence) {
      const threshold = 300; // standard silence threshold for dry studio recording
      // Find leading silence end
      for (let i = 0; i < int16Array.length; i++) {
        if (Math.abs(int16Array[i]) >= threshold) {
          startOffset = i;
          break;
        }
      }
      // Find trailing silence start
      for (let i = int16Array.length - 1; i >= startOffset; i--) {
        if (Math.abs(int16Array[i]) >= threshold) {
          endOffset = i + 1;
          break;
        }
      }
      int16Array = int16Array.subarray(startOffset, endOffset);
    }

    const leadingMs = (startOffset / 24000) * 1000;
    const trailingMs = ((originalLength - endOffset) / 24000) * 1000;

    const silenceReportResult = {
      leadingMs,
      trailingMs,
      originalDuration: originalLength / 24000,
      trimmedDuration: int16Array.length / 24000,
    };

    const float32Array = new Float32Array(int16Array.length);
    let maxVal = 0;
    for (let i = 0; i < int16Array.length; i++) {
      float32Array[i] = int16Array[i] / 32768.0; // standard Int16 to Float32 conversion
      const absVal = Math.abs(float32Array[i]);
      if (absVal > maxVal) {
        maxVal = absVal;
      }
    }

    const peakDb = maxVal > 0 ? 20 * Math.log10(maxVal) : -Infinity;

    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 24000,
      });
    }

    const ctx = audioCtxRef.current;
    const buffer = ctx.createBuffer(1, float32Array.length, 24000);
    buffer.copyToChannel(float32Array, 0);

    return { buffer, silenceReport: silenceReportResult, peakDb };
  };

  // Bulk Script Manager states
  const [scriptConsoleTab, setScriptConsoleTab] = useState<"single" | "bulk">(() => {
    try {
      return (localStorage.getItem("studio_script_console_tab") as "single" | "bulk") || "single";
    } catch (e) {
      return "single";
    }
  });

  const [bulkInputText, setBulkInputText] = useState<string>(() => {
    try {
      return localStorage.getItem("studio_bulk_input_text") || "";
    } catch (e) {
      return "";
    }
  });

  const [bulkFormat, setBulkFormat] = useState<"lines" | "csv">(() => {
    try {
      return (localStorage.getItem("studio_bulk_format") as "lines" | "csv") || "lines";
    } catch (e) {
      return "lines";
    }
  });

  const [bulkItems, setBulkItems] = useState<BulkItem[]>([]);
  const [isGeneratingBulk, setIsGeneratingBulk] = useState<boolean>(false);
  const [bulkProgressIndex, setBulkProgressIndex] = useState<number>(0);
  const [bulkUploadError, setBulkUploadError] = useState<string | null>(null);
  const [bulkIsDragging, setBulkIsDragging] = useState<boolean>(false);
  const [bulkFilter, setBulkFilter] = useState<"all" | "idle" | "generating" | "completed" | "failed">("all");
  const [showBulkTimelinePreview, setShowBulkTimelinePreview] = useState<boolean>(false);
  const [hoveredSegmentIndex, setHoveredSegmentIndex] = useState<number | null>(null);

  // Undo & Editing States for Bulk Batch Manager
  const [bulkUndoStack, setBulkUndoStack] = useState<BulkItem[][]>([]);
  const [editingBulkItemId, setEditingBulkItemId] = useState<string | null>(null);
  const [editingBulkText, setEditingBulkText] = useState<string>("");
  const [editingBulkVoice, setEditingBulkVoice] = useState<string>("");
  const [editingBulkTone, setEditingBulkTone] = useState<string>("");

  // Wrap setBulkItems to automatically record history for manual user changes
  const updateBulkItemsWithUndo = (newItems: BulkItem[] | ((prev: BulkItem[]) => BulkItem[])) => {
    setBulkItems(prev => {
      const next = typeof newItems === "function" ? newItems(prev) : newItems;
      setBulkUndoStack(undoPrev => {
        // Limit to 25 items to prevent excessive memory usage
        return [...undoPrev.slice(-24), prev];
      });
      return next;
    });
  };

  const handleUndoBulkAction = () => {
    if (bulkUndoStack.length === 0) return;
    const previousState = bulkUndoStack[bulkUndoStack.length - 1];
    setBulkUndoStack(prev => prev.slice(0, -1));
    setBulkItems(previousState);
  };

  // Sync state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem("studio_script_console_tab", scriptConsoleTab);
    } catch (e) {}
  }, [scriptConsoleTab]);

  useEffect(() => {
    try {
      localStorage.setItem("studio_bulk_input_text", bulkInputText);
    } catch (e) {}
  }, [bulkInputText]);

  useEffect(() => {
    try {
      localStorage.setItem("studio_bulk_format", bulkFormat);
    } catch (e) {}
  }, [bulkFormat]);

  // Save bulk items (excluding AudioBuffers which are non-serializable)
  useEffect(() => {
    try {
      const itemsToSave = bulkItems.map(item => ({
        id: item.id,
        text: item.text,
        voiceName: item.voiceName,
        toneDescription: item.toneDescription,
        status: item.status,
        error: item.error,
        base64Audio: item.base64Audio,
        duration: item.duration,
      }));
      localStorage.setItem("studio_bulk_items", JSON.stringify(itemsToSave));
    } catch (e) {
      console.warn("Error saving bulk items:", e);
    }
  }, [bulkItems]);

  // Restore bulk items from localStorage on initial render
  useEffect(() => {
    const loadAndDecodeSavedBulkItems = async () => {
      try {
        const savedRaw = localStorage.getItem("studio_bulk_items");
        if (savedRaw) {
          const parsed = JSON.parse(savedRaw);
          const restored: BulkItem[] = [];
          for (const item of parsed) {
            let audioBuffer: AudioBuffer | null = null;
            if (item.base64Audio && item.status === "completed") {
              try {
                const res = await decodeB64ToAudioBuffer(item.base64Audio);
                audioBuffer = res.buffer;
              } catch (err) {
                console.error("Error re-decoding restored bulk item:", err);
              }
            }
            restored.push({
              ...item,
              audioBuffer,
            });
          }
          if (restored.length > 0) {
            setBulkItems(restored);
          }
        }
      } catch (e) {
        console.warn("Error restoring bulk items:", e);
      }
    };
    loadAndDecodeSavedBulkItems();
  }, []);

  // Parse action from bulk input
  const handleParseBulkScripts = (rawText: string, format: "lines" | "csv", isManualAction = false) => {
    if (!rawText.trim()) {
      if (isManualAction) {
        updateBulkItemsWithUndo([]);
      } else {
        setBulkItems([]);
      }
      return;
    }

    if (format === "lines") {
      const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
      const parsed: BulkItem[] = lines.map((line, idx) => ({
        id: `line-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 7)}`,
        text: line,
        voiceName: selectedVoice,
        toneDescription: toneDescription,
        status: "idle",
      }));
      if (isManualAction) {
        updateBulkItemsWithUndo(parsed);
      } else {
        setBulkItems(parsed);
      }
      setBulkUploadError(null);
    } else {
      try {
        const parsedRows = parseCSV(rawText);
        if (parsedRows.length === 0) {
          setBulkUploadError("No valid rows parsed from CSV. Check header column names (Text, Voice, Tone).");
          return;
        }
        const parsed: BulkItem[] = parsedRows.map((row, idx) => ({
          id: `csv-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 7)}`,
          text: row.text,
          voiceName: row.voiceName && VOICES.some(v => v.name.toLowerCase() === row.voiceName!.toLowerCase())
            ? VOICES.find(v => v.name.toLowerCase() === row.voiceName!.toLowerCase())!.name
            : selectedVoice,
          toneDescription: row.toneDescription || toneDescription,
          status: "idle",
        }));
        if (isManualAction) {
          updateBulkItemsWithUndo(parsed);
        } else {
          setBulkItems(parsed);
        }
        setBulkUploadError(null);
      } catch (err: any) {
        setBulkUploadError("CSV parsing error. Ensure proper double quotes and structure.");
      }
    }
  };

  // Generate bulk batch sequentially
  const handleGenerateBulkBatch = async () => {
    if (isGeneratingBulk || bulkItems.length === 0) return;

    setIsGeneratingBulk(true);
    stopAudio();
    setBulkProgressIndex(0);

    const itemsToProcess = [...bulkItems];

    for (let i = 0; i < itemsToProcess.length; i++) {
      const item = itemsToProcess[i];
      
      // Skip completed unless forced
      if (item.status === "completed" && item.base64Audio) {
        setBulkProgressIndex(i + 1);
        continue;
      }

      setBulkItems(prev => prev.map(p => p.id === item.id ? { 
        ...p, 
        status: "generating",
        progressText: "Initiating: 10%",
        error: undefined
      } : p));
      setBulkProgressIndex(i);

      // We'll set a stateful tracking variable we can clear in the try/catch
      let progressTimer: any = null;

      try {
        let progressVal = 10;
        progressTimer = setInterval(() => {
          if (progressVal < 85) {
            progressVal += Math.floor(Math.random() * 8) + 4;
            if (progressVal > 85) progressVal = 85;

            let stage = "Synthesizing";
            if (progressVal < 30) stage = "Connecting";
            else if (progressVal < 55) stage = "Synthesizing";
            else if (progressVal < 75) stage = "Encoding";
            else stage = "Processing";

            setBulkItems(prev => prev.map(p => p.id === item.id && p.status === "generating" ? {
              ...p,
              progressText: `${stage}: ${progressVal}%`
            } : p));
          }
        }, 150);

        const response = await fetch("/api/generate-tts", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text: item.text,
            voiceName: item.voiceName,
            toneDescription: item.toneDescription,
          }),
        });

        clearInterval(progressTimer);

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Synthesis failed.");
        }

        if (!data.base64Audio) {
          throw new Error("Empty audio returned.");
        }

        // Quick decode phase update
        setBulkItems(prev => prev.map(p => p.id === item.id ? {
          ...p,
          progressText: "Decoding: 92%"
        } : p));

        const decoded = await decodeB64ToAudioBuffer(data.base64Audio);

        setBulkItems(prev => prev.map(p => p.id === item.id ? {
          ...p,
          status: "completed",
          base64Audio: data.base64Audio,
          audioBuffer: decoded.buffer,
          duration: decoded.buffer.duration,
          progressText: "Done",
          error: undefined,
        } : p));

      } catch (err: any) {
        if (progressTimer) clearInterval(progressTimer);
        console.error(`Error generating bulk item ${i + 1}:`, err);
        
        // Clean up error message for user friendly status display
        let errMsg = err.message || "Synthesis failed";
        let shortMsg = "API Error";
        if (errMsg.toLowerCase().includes("rate limit") || errMsg.includes("429")) {
          shortMsg = "API Error: Rate Limit";
        } else if (errMsg.toLowerCase().includes("network") || errMsg.toLowerCase().includes("fetch")) {
          shortMsg = "Conn Error: Offline";
        } else if (errMsg.toLowerCase().includes("voice")) {
          shortMsg = "API Error: Bad Voice";
        } else {
          // Limit error length to keep layout neat but readable
          const cleanErr = errMsg.replace(/^error:\s*/i, "");
          shortMsg = cleanErr.length > 25 ? `Err: ${cleanErr.substring(0, 22)}...` : `Err: ${cleanErr}`;
        }

        setBulkItems(prev => prev.map(p => p.id === item.id ? {
          ...p,
          status: "failed",
          error: errMsg,
          progressText: shortMsg,
        } : p));
      }

      setBulkProgressIndex(i + 1);
    }

    setIsGeneratingBulk(false);
  };

  // Play a completed bulk item in the master bus visualizer & audio channel
  const handlePlayBulkItem = (item: BulkItem) => {
    if (!item.base64Audio || !item.audioBuffer) return;

    stopAudio();
    setIsPlaying(false);

    setBase64Audio(item.base64Audio);
    audioBufferRef.current = item.audioBuffer;
    
    decodeB64ToAudioBuffer(item.base64Audio).then(res => {
      setSilenceReport(res.silenceReport);
      setAudioPeakDb(res.peakDb);
      setAudioDuration(res.buffer.duration);
    }).catch(err => {
      console.error(err);
      setAudioDuration(item.audioBuffer!.duration);
    });

    pausedAtRef.current = 0;
    setCurrentTime(0);
    setPlaybackProgress(0);

    // Auto-trigger playback
    setTimeout(() => {
      playAudio();
    }, 80);
  };

  // Convert base64 PCM back to a downloadable WAV format (supports bulk downloads)
  const handleDownloadWavForItem = (pcmDataB64: string, voiceName: string, textSnippet: string) => {
    const binaryString = window.atob(pcmDataB64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    let pcm16 = new Int16Array(bytes.buffer);
    const sampleRate = 24000;

    if (normalizeAudio) {
      let maxVal = 0;
      for (let i = 0; i < pcm16.length; i++) {
        const absVal = Math.abs(pcm16[i]);
        if (absVal > maxVal) maxVal = absVal;
      }
      const targetDb = -1.0;
      const targetAmp = Math.pow(10, targetDb / 20) * 32768;
      const normFactor = maxVal > 0 ? targetAmp / maxVal : 1.0;

      const normalized = new Int16Array(pcm16.length);
      for (let i = 0; i < pcm16.length; i++) {
        let val = Math.round(pcm16[i] * normFactor);
        if (val > 32767) val = 32767;
        else if (val < -32768) val = -32768;
        normalized[i] = val;
      }
      pcm16 = normalized;
    }

    const wavBuffer = new ArrayBuffer(44 + pcm16.length * 2);
    const view = new DataView(wavBuffer);

    const writeString = (view: DataView, offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    writeString(view, 0, "RIFF");
    view.setUint32(4, 36 + pcm16.length * 2, true);
    writeString(view, 8, "WAVE");
    writeString(view, 12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, "data");
    view.setUint32(40, pcm16.length * 2, true);

    for (let i = 0; i < pcm16.length; i++) {
      view.setInt16(44 + i * 2, pcm16[i], true);
    }

    const blob = new Blob([view], { type: "audio/wav" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const cleanSnippet = textSnippet.slice(0, 25).toLowerCase().replace(/[^a-z0-9]+/g, "-");
    a.download = `voiceover-${voiceName.toLowerCase()}-${cleanSnippet || "audio"}.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // ZIP pack & export function for bulk items
  const handleDownloadAllAsZip = async () => {
    const completed = bulkItems.filter(item => item.status === "completed" && item.base64Audio);
    if (completed.length === 0) return;

    const zip = new JSZip();

    for (let idx = 0; idx < completed.length; idx++) {
      const item = completed[idx];
      const binaryString = window.atob(item.base64Audio!);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      let pcm16 = new Int16Array(bytes.buffer);
      const sampleRate = 24000;

      if (normalizeAudio) {
        let maxVal = 0;
        for (let i = 0; i < pcm16.length; i++) {
          const absVal = Math.abs(pcm16[i]);
          if (absVal > maxVal) maxVal = absVal;
        }
        const targetDb = -1.0;
        const targetAmp = Math.pow(10, targetDb / 20) * 32768;
        const normFactor = maxVal > 0 ? targetAmp / maxVal : 1.0;

        const normalized = new Int16Array(pcm16.length);
        for (let i = 0; i < pcm16.length; i++) {
          let val = Math.round(pcm16[i] * normFactor);
          if (val > 32767) val = 32767;
          else if (val < -32768) val = -32768;
          normalized[i] = val;
        }
        pcm16 = normalized;
      }

      const wavBuffer = new ArrayBuffer(44 + pcm16.length * 2);
      const view = new DataView(wavBuffer);

      const writeString = (view: DataView, offset: number, str: string) => {
        for (let i = 0; i < str.length; i++) {
          view.setUint8(offset + i, str.charCodeAt(i));
        }
      };

      writeString(view, 0, "RIFF");
      view.setUint32(4, 36 + pcm16.length * 2, true);
      writeString(view, 8, "WAVE");
      writeString(view, 12, "fmt ");
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, 1, true);
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, sampleRate * 2, true);
      view.setUint16(32, 2, true);
      view.setUint16(34, 16, true);
      writeString(view, 36, "data");
      view.setUint32(40, pcm16.length * 2, true);

      for (let i = 0; i < pcm16.length; i++) {
        view.setInt16(44 + i * 2, pcm16[i], true);
      }

      const cleanSnippet = item.text.slice(0, 20).toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const filename = `${String(idx + 1).padStart(2, "0")}-${item.voiceName.toLowerCase()}-${cleanSnippet || "audio"}.wav`;
      
      zip.file(filename, view.buffer);
    }

    try {
      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const a = document.createElement("a");
      a.href = url;
      a.download = `voiceover-batch-${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to generate zip file:", err);
    }
  };

  // Drag-and-drop or browse file handler
  const handleBulkFileLoad = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (content) {
        setBulkInputText(content);
        if (file.name.endsWith(".csv")) {
          setBulkFormat("csv");
          handleParseBulkScripts(content, "csv", true);
        } else {
          setBulkFormat("lines");
          handleParseBulkScripts(content, "lines", true);
        }
      }
    };
    reader.readAsText(file);
  };

  // Seamless active comparison crossfader/switcher
  const switchPlaySlot = async (slot: "A" | "B") => {
    if (slot === activePlaySlot) return;
    
    const wasPlaying = isPlaying;
    const currentPos = currentTime;
    
    // Stop the active sound source without resetting global state variables
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.stop();
      } catch (e) {}
      sourceNodeRef.current = null;
    }
    setIsPlaying(false);
    
    // Select targets
    const targetAudio = slot === "A" ? audioA : audioB;
    const targetBuffer = slot === "A" ? audioBufferA : audioBufferB;
    const targetReport = slot === "A" ? silenceReportA : silenceReportB;
    
    setActivePlaySlot(slot);
    setBase64Audio(targetAudio);
    audioBufferRef.current = targetBuffer;
    setSilenceReport(targetReport);
    
    if (targetBuffer) {
      const targetTime = Math.min(currentPos, targetBuffer.duration);
      pausedAtRef.current = targetTime;
      setCurrentTime(targetTime);
      setAudioDuration(targetBuffer.duration);
      setPlaybackProgress((targetTime / targetBuffer.duration) * 100);
      
      if (wasPlaying && targetAudio) {
        // Run playAudio on the next tick
        setTimeout(() => {
          playAudio();
        }, 50);
      }
    } else {
      pausedAtRef.current = 0;
      setCurrentTime(0);
      setAudioDuration(0);
      setPlaybackProgress(0);
    }
  };

  // Handle TTS Generation request (supports consecutively queueing and building two voices)
  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);
    stopAudio();
    
    // Clear old state
    if (isComparisonMode) {
      setAudioA(null);
      setAudioB(null);
      setAudioBufferA(null);
      setAudioBufferB(null);
      setSilenceReportA(null);
      setSilenceReportB(null);
    }
    setBase64Audio(null);
    setAudioDuration(0);
    setCurrentTime(0);
    setPlaybackProgress(0);

    try {
      if (isComparisonMode) {
        // CONSECUTIVE GENERATION FOR COMPARISON MODE
        
        // 1. Generate Voice A
        setGenerationStage("voiceA");
        const responseA = await fetch("/api/generate-tts", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text,
            voiceName: comparisonVoiceA,
            toneDescription,
          }),
        });

        const dataA = await responseA.json();
        if (!responseA.ok) {
          throw new Error(dataA.error || `Failed to generate Voice A (${comparisonVoiceA}).`);
        }

        if (!dataA.base64Audio) {
          throw new Error(`No audio returned from server for Voice A (${comparisonVoiceA}).`);
        }

        const decodedA = await decodeB64ToAudioBuffer(dataA.base64Audio);
        setAudioA(dataA.base64Audio);
        setAudioBufferA(decodedA.buffer);
        setSilenceReportA(decodedA.silenceReport);

        // 2. Generate Voice B
        setGenerationStage("voiceB");
        const responseB = await fetch("/api/generate-tts", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text,
            voiceName: comparisonVoiceB,
            toneDescription,
          }),
        });

        const dataB = await responseB.json();
        if (!responseB.ok) {
          throw new Error(dataB.error || `Failed to generate Voice B (${comparisonVoiceB}).`);
        }

        if (!dataB.base64Audio) {
          throw new Error(`No audio returned from server for Voice B (${comparisonVoiceB}).`);
        }

        const decodedB = await decodeB64ToAudioBuffer(dataB.base64Audio);
        setAudioB(dataB.base64Audio);
        setAudioBufferB(decodedB.buffer);
        setSilenceReportB(decodedB.silenceReport);

        // Load Voice A as default active slot in the player
        setActivePlaySlot("A");
        setBase64Audio(dataA.base64Audio);
        audioBufferRef.current = decodedA.buffer;
        setSilenceReport(decodedA.silenceReport);
        setAudioDuration(decodedA.buffer.duration);
        setAudioPeakDb(decodedA.peakDb);

        // Auto-save voice configurations to recent memories
        saveVoiceConfig(comparisonVoiceA, toneDescription, pitchShift);
        saveVoiceConfig(comparisonVoiceB, toneDescription, pitchShift);

      } else {
        // SINGLE VOICE MODE
        const response = await fetch("/api/generate-tts", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text,
            voiceName: selectedVoice,
            toneDescription,
          }),
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Failed to generate dry studio audio.");
        }

        if (data.base64Audio) {
          setBase64Audio(data.base64Audio);
          await loadAudioBuffer(data.base64Audio);
          // Auto-save voice configuration to recent memories
          saveVoiceConfig(selectedVoice, toneDescription, pitchShift);
        } else {
          throw new Error("No audio returned from server.");
        }
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An unexpected error occurred. Please try again.");
    } finally {
      setIsGenerating(false);
      setGenerationStage("idle");
    }
  };

  // Pre-load PCM buffer to extract duration
  const loadAudioBuffer = async (b64Data: string): Promise<AudioBuffer> => {
    try {
      // Decode base64 16-bit PCM (24000Hz mono)
      const binaryString = window.atob(b64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      let int16Array = new Int16Array(bytes.buffer);
      const originalLength = int16Array.length;
      let startOffset = 0;
      let endOffset = int16Array.length;

      if (trimSilence) {
        const threshold = 300; // standard silence threshold for dry studio recording
        // Find leading silence end
        for (let i = 0; i < int16Array.length; i++) {
          if (Math.abs(int16Array[i]) >= threshold) {
            startOffset = i;
            break;
          }
        }
        // Find trailing silence start
        for (let i = int16Array.length - 1; i >= startOffset; i--) {
          if (Math.abs(int16Array[i]) >= threshold) {
            endOffset = i + 1;
            break;
          }
        }
        int16Array = int16Array.subarray(startOffset, endOffset);
      }

      const leadingMs = (startOffset / 24000) * 1000;
      const trailingMs = ((originalLength - endOffset) / 24000) * 1000;

      setSilenceReport({
        leadingMs,
        trailingMs,
        originalDuration: originalLength / 24000,
        trimmedDuration: int16Array.length / 24000,
      });

      const float32Array = new Float32Array(int16Array.length);
      let maxVal = 0;
      for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / 32768.0; // standard Int16 to Float32 conversion
        const absVal = Math.abs(float32Array[i]);
        if (absVal > maxVal) {
          maxVal = absVal;
        }
      }

      // Calculate peak dB of raw signal
      const peakDb = maxVal > 0 ? 20 * Math.log10(maxVal) : -Infinity;
      setAudioPeakDb(peakDb);

      // Initialize audio context at 24000Hz (native TTS output rate)
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
          sampleRate: 24000,
        });
      }

      const ctx = audioCtxRef.current;
      const buffer = ctx.createBuffer(1, float32Array.length, 24000);
      buffer.copyToChannel(float32Array, 0);

      audioBufferRef.current = buffer;
      setAudioDuration(buffer.duration);
      return buffer;
    } catch (e: any) {
      console.error("Error decoding PCM buffer:", e);
      throw new Error("Failed to parse high-fidelity 24kHz audio format.");
    }
  };

  // Play compiled audio
  const playAudio = async () => {
    if (!base64Audio) return;

    try {
      if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
          sampleRate: 24000,
        });
      }
      
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") {
        await ctx.resume();
      }

      // If already playing, stop first
      if (isPlaying) {
        pauseAudio();
        return;
      }

      let buffer = audioBufferRef.current;
      if (!buffer) {
        buffer = await loadAudioBuffer(base64Audio);
      }

      // Setup audio nodes
      const sourceNode = ctx.createBufferSource();
      sourceNode.buffer = buffer;
      sourceNode.playbackRate.value = playbackSpeed;

      // Apply pitch shift (detune in cents: 100 cents per semitone, 1200 cents per octave)
      const cents = 1200 * Math.log2(1 + pitchShift / 100);
      sourceNode.detune.value = cents;

      // 1. Configure the EQ + Compressor + Reverb Signal Chain for the dry vocal:
      let dspInput = sourceNode;
      
      // EQ Low Shelf (Bass)
      const bassFilter = ctx.createBiquadFilter();
      bassFilter.type = "lowshelf";
      bassFilter.frequency.value = 180; // focus on voice warmth frequencies
      bassFilter.gain.value = dspBassBoost;
      
      dspInput.connect(bassFilter);
      let dspCurrent: AudioNode = bassFilter;
      
      // EQ High Shelf (Treble)
      const trebleFilter = ctx.createBiquadFilter();
      trebleFilter.type = "highshelf";
      trebleFilter.frequency.value = 3200; // vocal air & presence
      trebleFilter.gain.value = dspTrebleBoost;
      
      dspCurrent.connect(trebleFilter);
      dspCurrent = trebleFilter;
      
      // Studio Compressor (Smooth volume spikes)
      if (dspCompressorEnabled) {
        const compressor = ctx.createDynamicsCompressor();
        compressor.threshold.value = -16;
        compressor.knee.value = 10;
        compressor.ratio.value = 4;
        compressor.attack.value = 0.005;
        compressor.release.value = 0.12;
        
        dspCurrent.connect(compressor);
        dspCurrent = compressor;
      }
      
      // Master effect combiner
      const vocalEffectsOutput = ctx.createGain();
      vocalEffectsOutput.gain.value = 1.0;
      
      // Connect direct vocal signal to output
      dspCurrent.connect(vocalEffectsOutput);
      
      // Reverb / Room Slapback (Parallel Delay feedback loop)
      if (dspReverbMix > 0) {
        const delayNode = ctx.createDelay(1.0);
        delayNode.delayTime.value = dspReverbDelayTime;
        
        const feedbackGain = ctx.createGain();
        feedbackGain.gain.value = dspReverbFeedback / 100;
        
        const wetGain = ctx.createGain();
        wetGain.gain.value = dspReverbMix / 100;
        
        // Feed vocal into delay
        dspCurrent.connect(delayNode);
        
        // Delay feedback loop
        delayNode.connect(feedbackGain);
        feedbackGain.connect(delayNode);
        
        // Feed delay to wet gain, then to combiner
        delayNode.connect(wetGain);
        wetGain.connect(vocalEffectsOutput);
      }
      
      // Visualizer node hooks the processed vocal
      const analyserNode = ctx.createAnalyser();
      analyserNode.fftSize = 256;
      vocalEffectsOutput.connect(analyserNode);

      // Create main output stage
      const gainNode = ctx.createGain();
      let playGain = isMuted ? 0 : volume;
      if (normalizeAudio) {
        playGain = playGain * getNormalizationFactor();
      }
      gainNode.gain.value = playGain;
      
      // Connect processed vocal to main gain node
      analyserNode.connect(gainNode);
      gainNode.connect(ctx.destination);

      // 2. Setup Premium Sound-bed Ambient Mixer
      activeAmbientNodesRef.current = [];
      if (ambientTrack !== "none") {
        const ambientGain = ctx.createGain();
        ambientGain.gain.value = ambientVolume / 100;
        ambientGain.connect(gainNode); // mix with master volume
        ambientGainNodeRef.current = ambientGain;

        if (ambientTrack === "space") {
          // Deep Space Drone (procedural synth low-end drone)
          const osc1 = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          const filter = ctx.createBiquadFilter();
          const lfo = ctx.createOscillator();
          const lfoGain = ctx.createGain();
          const amp = ctx.createGain();

          osc1.type = "sine";
          osc1.frequency.value = 55; // A1
          osc2.type = "triangle";
          osc2.frequency.value = 82.41; // E2 (Perfect Fifth)

          filter.type = "lowpass";
          filter.frequency.value = 130;

          lfo.frequency.value = 0.08; // extremely slow oscillation
          lfoGain.gain.value = 0.15; // modulate volume +/- 15%

          amp.gain.value = 0.25;

          lfo.connect(lfoGain);
          lfoGain.connect(amp.gain);

          osc1.connect(filter);
          osc2.connect(filter);
          filter.connect(amp);
          amp.connect(ambientGain);

          osc1.start(0);
          osc2.start(0);
          lfo.start(0);

          activeAmbientNodesRef.current.push(osc1, osc2, lfo);
        } else if (ambientTrack === "tape") {
          // Analog Tape Hiss (procedural pink/brown loop + tiny random cracks)
          const bufferSize = ctx.sampleRate * 2.0; // 2-second loop
          const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
          const output = noiseBuffer.getChannelData(0);
          let lastOut = 0.0;
          for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            // First-order lowpass leaking filter to make it brown noise
            output[i] = (lastOut + (0.015 * white)) / 1.015;
            lastOut = output[i];
            output[i] *= 4.0; // boost noise body

            // Inject occasional tiny vinyl static pops
            if (Math.random() < 0.0001) {
              output[i] += (Math.random() * 2 - 1) * 0.4;
            }
          }

          const noiseSource = ctx.createBufferSource();
          noiseSource.buffer = noiseBuffer;
          noiseSource.loop = true;

          const noiseFilter = ctx.createBiquadFilter();
          noiseFilter.type = "bandpass";
          noiseFilter.frequency.value = 700;
          noiseFilter.Q.value = 0.4;

          noiseSource.connect(noiseFilter);
          noiseFilter.connect(ambientGain);

          noiseSource.start(0);
          activeAmbientNodesRef.current.push(noiseSource);
        } else if (ambientTrack === "pad") {
          // Cosmic Pad (triad minor-seventh slow sweep synth pad)
          const freqs = [196.0, 233.08, 293.66, 349.23];
          const padFilter = ctx.createBiquadFilter();
          padFilter.type = "lowpass";
          padFilter.frequency.value = 350;

          const padLfo = ctx.createOscillator();
          const padLfoGain = ctx.createGain();
          padLfo.frequency.value = 0.06; // sweep very slowly
          padLfoGain.gain.value = 120; // sweep filter cutoff +/- 120Hz

          padLfo.connect(padLfoGain);
          padLfoGain.connect(padFilter.frequency);

          const padSumGain = ctx.createGain();
          padSumGain.gain.value = 0.3;

          freqs.forEach(freq => {
            const osc = ctx.createOscillator();
            osc.type = "triangle";
            osc.frequency.value = freq;
            osc.detune.value = (Math.random() * 2 - 1) * 8; // subtle detune for warmth

            const oscGain = ctx.createGain();
            oscGain.gain.value = 0.06;

            osc.connect(oscGain);
            oscGain.connect(padSumGain);

            osc.start(0);
            activeAmbientNodesRef.current.push(osc);
          });

          padSumGain.connect(padFilter);
          padFilter.connect(ambientGain);

          padLfo.start(0);
          activeAmbientNodesRef.current.push(padLfo);
        }
      }

      sourceNodeRef.current = sourceNode;
      gainNodeRef.current = gainNode;
      analyserNodeRef.current = analyserNode;

      // Calculate resume offset with interactive trim boundaries
      const duration = buffer.duration;
      const trimStartSec = trimStartRatio * duration;
      const trimEndSec = trimEndRatio * duration;

      let offset = pausedAtRef.current;
      if (offset < trimStartSec || offset > trimEndSec) {
        offset = trimStartSec;
      }

      // Real-time visual fade-in and fade-out to prevent pops/clicks at audio boundaries
      const now = ctx.currentTime;
      if (fadeInDuration > 0 && offset < trimStartSec + fadeInDuration) {
        gainNode.gain.setValueAtTime(0, now);
        const rampDuration = Math.max(0.01, (trimStartSec + fadeInDuration - offset) / playbackSpeed);
        gainNode.gain.linearRampToValueAtTime(playGain, now + rampDuration);
      } else {
        gainNode.gain.setValueAtTime(playGain, now);
      }

      if (fadeOutDuration > 0) {
        const totalDur = trimEndSec;
        const fadeOutStartOffset = totalDur - fadeOutDuration;
        if (offset < fadeOutStartOffset) {
          const timeToFadeOutStart = (fadeOutStartOffset - offset) / playbackSpeed;
          const timeToFadeOutEnd = (totalDur - offset) / playbackSpeed;
          gainNode.gain.setValueAtTime(playGain, now + timeToFadeOutStart);
          gainNode.gain.linearRampToValueAtTime(0, now + timeToFadeOutEnd);
        } else if (offset < totalDur) {
          const currentFadeRatio = Math.max(0, (totalDur - offset) / fadeOutDuration);
          const initialVolume = playGain * currentFadeRatio;
          gainNode.gain.setValueAtTime(initialVolume, now);
          const timeToFadeOutEnd = (totalDur - offset) / playbackSpeed;
          gainNode.gain.linearRampToValueAtTime(0, now + timeToFadeOutEnd);
        }
      }

      sourceNode.start(0, offset);
      startTimeRef.current = ctx.currentTime - offset / playbackSpeed;
      
      setIsPlaying(true);

      // Listen for playback completion
      sourceNode.onended = () => {
        // Only trigger ended if it finished naturally
        const playedDuration = (ctx.currentTime - startTimeRef.current) * playbackSpeed;
        if (playedDuration >= trimEndSec - 0.1) {
          setIsPlaying(false);
          setCurrentTime(trimStartSec);
          setPlaybackProgress(trimStartRatio * 100);
          pausedAtRef.current = trimStartSec;
        }
      };

      // Start animation loop and tracking
      trackPlayback();
      drawWaveform();

    } catch (err: any) {
      console.error("Playback error:", err);
      setError("Audio playback failed. Please try regenerating.");
    }
  };

  // Pause audio
  const pauseAudio = () => {
    if (!isPlaying || !sourceNodeRef.current || !audioCtxRef.current) return;
    
    try {
      sourceNodeRef.current.stop();
    } catch (e) {}

    // Stop and clear active ambient synth nodes
    if (activeAmbientNodesRef.current) {
      activeAmbientNodesRef.current.forEach(node => {
        try {
          node.stop();
        } catch (e) {}
      });
      activeAmbientNodesRef.current = [];
    }
    ambientGainNodeRef.current = null;

    const ctx = audioCtxRef.current;
    const elapsed = (ctx.currentTime - startTimeRef.current) * playbackSpeed;
    pausedAtRef.current = Math.min(elapsed, (audioBufferRef.current?.duration || 0));
    setIsPlaying(false);
  };

  // Stop / Reset audio
  const stopAudio = () => {
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.stop();
      } catch (e) {}
    }
    sourceNodeRef.current = null;

    // Stop and clear active ambient synth nodes
    if (activeAmbientNodesRef.current) {
      activeAmbientNodesRef.current.forEach(node => {
        try {
          node.stop();
        } catch (e) {}
      });
      activeAmbientNodesRef.current = [];
    }
    ambientGainNodeRef.current = null;

    pausedAtRef.current = 0;
    setCurrentTime(0);
    setPlaybackProgress(0);
    setIsPlaying(false);
  };

  // Track current reading progress
  const trackPlayback = () => {
    if (!isPlaying || !audioCtxRef.current || !audioBufferRef.current) return;

    const ctx = audioCtxRef.current;
    const elapsed = (ctx.currentTime - startTimeRef.current) * playbackSpeed;
    const duration = audioBufferRef.current.duration;
    const trimStartSec = trimStartRatio * duration;
    const trimEndSec = trimEndRatio * duration;

    if (elapsed <= trimEndSec) {
      setCurrentTime(elapsed);
      setPlaybackProgress((elapsed / duration) * 100);
      requestAnimationFrame(trackPlayback);
    } else {
      // Stopped precisely at trim end marker
      setIsPlaying(false);
      pausedAtRef.current = trimStartSec;
      setCurrentTime(trimStartSec);
      setPlaybackProgress(trimStartRatio * 100);
      if (sourceNodeRef.current) {
        try {
          sourceNodeRef.current.stop();
        } catch (e) {}
      }
    }
  };

  // Interactive seek bar
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!audioBufferRef.current) return;
    const percent = parseFloat(e.target.value);
    const duration = audioBufferRef.current.duration;
    let targetSeconds = (percent / 100) * duration;
    
    const trimStartSec = trimStartRatio * duration;
    const trimEndSec = trimEndRatio * duration;

    if (targetSeconds < trimStartSec) targetSeconds = trimStartSec;
    if (targetSeconds > trimEndSec) targetSeconds = trimEndSec;

    stopAudio();
    pausedAtRef.current = targetSeconds;
    setCurrentTime(targetSeconds);
    setPlaybackProgress((targetSeconds / duration) * 100);
    
    // Resume automatically if it was playing
    if (isPlaying || base64Audio) {
      setTimeout(() => {
        playAudio();
      }, 50);
    }
  };

  // Change playback speed
  const handleSpeedChange = (speed: number) => {
    setPlaybackSpeed(speed);
    if (isPlaying && sourceNodeRef.current) {
      sourceNodeRef.current.playbackRate.value = speed;
      // Re-calculate startTime to align progress accurately
      if (audioCtxRef.current) {
        const ctx = audioCtxRef.current;
        startTimeRef.current = ctx.currentTime - currentTime / speed;
      }
    }
  };

  // Change pitch shift
  const handlePitchChange = (shift: number) => {
    setPitchShift(shift);
    if (sourceNodeRef.current) {
      const cents = 1200 * Math.log2(1 + shift / 100);
      sourceNodeRef.current.detune.value = cents;
    }
  };

  // Format sync segment times for display (m:ss.d)
  const formatSyncTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.floor((sec % 1) * 10);
    return `${m}:${s.toString().padStart(2, "0")}.${ms}`;
  };

  // Seek to specific time from the Sync Script analysis list
  const handleSeekToTime = (targetSeconds: number) => {
    if (!audioBufferRef.current) return;
    const duration = audioBufferRef.current.duration;
    const clampedTime = Math.max(0, Math.min(targetSeconds, duration));
    const percent = (clampedTime / duration) * 100;
    
    const wasPlaying = isPlaying;
    if (isPlaying) {
      pauseAudio();
    }
    pausedAtRef.current = clampedTime;
    setCurrentTime(clampedTime);
    setPlaybackProgress(percent);
    
    if (wasPlaying) {
      setTimeout(() => {
        playAudio();
      }, 50);
    }
  };

  // Perform basic analysis on the generated audio waveform to estimate word-per-minute speed and sync
  const handleSyncScript = () => {
    if (!audioBufferRef.current) return;

    const duration = audioBufferRef.current.duration;
    const channelData = audioBufferRef.current.getChannelData(0);
    const sampleRate = audioBufferRef.current.sampleRate;

    // 1. Split script text into sentences or major clauses safely
    const rawSentences = text
      .replace(/([.!?])\s+/g, "$1|")
      .split("|")
      .map(s => s.trim())
      .filter(s => s.length > 0);

    if (rawSentences.length === 0) return;

    // 2. Downsample audio channel data to calculate local amplitude envelope over 100ms intervals
    const intervalMs = 100;
    const chunkSize = Math.floor(sampleRate * (intervalMs / 1000));
    const energies: number[] = [];

    for (let i = 0; i < channelData.length; i += chunkSize) {
      let sumSquares = 0;
      const end = Math.min(i + chunkSize, channelData.length);
      for (let j = i; j < end; j++) {
        sumSquares += channelData[j] * channelData[j];
      }
      energies.push(Math.sqrt(sumSquares / (end - i)));
    }

    // 3. Compute character length ratios to weight expected proportional timeline segment starts
    const totalChars = rawSentences.reduce((sum, s) => sum + s.length, 0);
    let cumulativeTime = 0;

    const segmentBoundaries: number[] = [0];

    for (let idx = 0; idx < rawSentences.length - 1; idx++) {
      const sentence = rawSentences[idx];
      const propDuration = (sentence.length / totalChars) * duration;
      const expectedBoundarySec = cumulativeTime + propDuration;

      // Map expected time boundary to the nearest energy index
      const expectedBoundaryIdx = Math.floor(expectedBoundarySec * (1000 / intervalMs));

      // Search range around expected boundary +/- 1.5s to align with a local silence (energy trough)
      const searchRadiusIdx = Math.floor(1500 / intervalMs);
      const startSearchIdx = Math.max(0, expectedBoundaryIdx - searchRadiusIdx);
      const endSearchIdx = Math.min(energies.length - 1, expectedBoundaryIdx + searchRadiusIdx);

      let minEnergy = Infinity;
      let troughIdx = expectedBoundaryIdx;

      for (let k = startSearchIdx; k <= endSearchIdx; k++) {
        const energy = energies[k];
        if (energy < minEnergy) {
          minEnergy = energy;
          troughIdx = k;
        }
      }

      // Convert aligned trough index back to seconds
      const alignedBoundarySec = troughIdx * (intervalMs / 1000);
      segmentBoundaries.push(alignedBoundarySec);
      cumulativeTime = alignedBoundarySec;
    }

    // Append the end of the audio as the final boundary
    segmentBoundaries.push(duration);

    // 4. Calculate word-per-minute speeds and deviations for each segment
    const analyzedSegments: SyncAnalysisSegment[] = [];
    let totalWordCount = 0;

    for (let idx = 0; idx < rawSentences.length; idx++) {
      const sentence = rawSentences[idx];
      const start = segmentBoundaries[idx];
      const end = segmentBoundaries[idx + 1];
      const segDuration = Math.max(0.2, end - start);

      const words = sentence.split(/\s+/).filter(w => w.length > 0);
      const wordCount = words.length;
      totalWordCount += wordCount;

      const wpm = (wordCount / segDuration) * 60;

      analyzedSegments.push({
        text: sentence,
        startTime: start,
        endTime: end,
        duration: segDuration,
        wordCount,
        wpm,
        deviation: 0,
        status: "normal"
      });
    }

    // Calculate average speed
    const calculatedAvgWpm = (totalWordCount / duration) * 60;
    setAverageWpm(calculatedAvgWpm);

    // 5. Categorize pacing deviation relative to average
    const finalSegments = analyzedSegments.map(seg => {
      // Deviation percentage
      const pctDeviation = Math.round(((seg.wpm - calculatedAvgWpm) / calculatedAvgWpm) * 100);
      
      let status: "fast" | "slow" | "normal" = "normal";
      if (pctDeviation >= 15) {
        status = "fast";
      } else if (pctDeviation <= -15) {
        status = "slow";
      }

      return {
        ...seg,
        deviation: pctDeviation,
        status
      };
    });

    setSyncSegments(finalSegments);
    setIsSynced(true);
  };

  // Real-time Wave Canvas Visualizer
  const drawWaveform = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Setup visualizer styles (Brushed steel analog glowing wave)
    const analyser = analyserNodeRef.current;
    const isAudioPlaying = isPlaying && analyser;

    if (isAudioPlaying) {
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      analyser.getByteTimeDomainData(dataArray);

      // Real-time Ducking evaluation based on actual voice amplitude
      if (autoDuckingEnabled && ambientGainNodeRef.current && audioCtxRef.current) {
        let sumSquares = 0;
        for (let i = 0; i < bufferLength; i++) {
          const val = (dataArray[i] - 128) / 128;
          sumSquares += val * val;
        }
        const rms = Math.sqrt(sumSquares / bufferLength);
        
        // Threshold of 0.012 separates human voice presence from background/digital noise
        const isSpeaking = rms > 0.012;
        
        // Target: duck background soundscape volume to 25% when speaking, restore to 100% when silent/paused
        const targetMultiplier = isSpeaking ? 0.25 : 1.0;
        const targetGain = (targetMultiplier * ambientVolume) / 100;
        
        const ctxTime = audioCtxRef.current.currentTime;
        ambientGainNodeRef.current.gain.setTargetAtTime(targetGain, ctxTime, 0.12);
      }

      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(74, 222, 128, 0.95)"; // Vibrant neon green vacuum tube color
      ctx.shadowBlur = 10;
      ctx.shadowColor = "rgba(74, 222, 128, 0.6)";

      ctx.beginPath();
      
      // Calculate zoomed slice centered around the middle of the buffer
      const zoomLength = Math.max(16, Math.floor(bufferLength / waveformZoom));
      const startIdx = Math.floor((bufferLength - zoomLength) / 2);
      const sliceWidth = width / zoomLength;
      let x = 0;

      for (let i = startIdx; i < startIdx + zoomLength; i++) {
        if (i < 0 || i >= bufferLength) continue;
        const v = dataArray[i] / 128.0;
        const y = (v * height) / 2;

        if (i === startIdx) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }

        x += sliceWidth;
      }

      ctx.stroke();

      // Add a subtle reflection/fill
      ctx.shadowBlur = 0;
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(74, 222, 128, 0.2)";
      ctx.stroke();

      animationFrameRef.current = requestAnimationFrame(drawWaveform);
    } else if (audioBufferRef.current) {
      // Draw actual generated audio static peak waveform (Professional Transient Inspector)
      const data = audioBufferRef.current.getChannelData(0);
      const windowSize = data.length / waveformZoom;
      const maxStart = data.length - windowSize;
      const startSample = Math.floor((waveformPan / 100) * maxStart);
      const step = windowSize / width;
      const samplesPerPixel = Math.max(1, Math.floor(windowSize / width));

      for (let x = 0; x < width; x++) {
        const chunkStart = Math.floor(startSample + x * step);
        const chunkEnd = Math.min(data.length, chunkStart + samplesPerPixel);
        let min = 0;
        let max = 0;
        for (let s = chunkStart; s < chunkEnd; s++) {
          const val = data[s];
          if (val < min) min = val;
          if (val > max) max = val;
        }

        const yMin = height / 2 + (min * (height / 2) * 0.95);
        const yMax = height / 2 + (max * (height / 2) * 0.95);

        const currentRatio = chunkStart / data.length;
        const isTrimmed = currentRatio < trimStartRatio || currentRatio > trimEndRatio;

        if (isTrimmed) {
          ctx.strokeStyle = "rgba(142, 146, 153, 0.2)";
          ctx.shadowBlur = 0;
        } else {
          ctx.strokeStyle = "rgba(74, 222, 128, 0.85)";
          ctx.shadowBlur = 4;
          ctx.shadowColor = "rgba(74, 222, 128, 0.4)";
        }

        ctx.beginPath();
        ctx.moveTo(x, yMin);
        ctx.lineTo(x, yMax);
        ctx.stroke();
      }

      ctx.shadowBlur = 0;

      // Draw trim start and trim end line markers
      const trimStartSample = trimStartRatio * data.length;
      const trimEndSample = trimEndRatio * data.length;

      // Trim Start Marker
      if (trimStartSample >= startSample && trimStartSample <= startSample + windowSize) {
        const markerX = ((trimStartSample - startSample) / windowSize) * width;
        ctx.strokeStyle = "#F59E0B"; // Warm amber trim start marker
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(markerX, 0);
        ctx.lineTo(markerX, height);
        ctx.stroke();

        // Draw a handle block at the top
        ctx.fillStyle = "#F59E0B";
        ctx.fillRect(markerX - 4, 0, 8, 8);
      }

      // Trim End Marker
      if (trimEndSample >= startSample && trimEndSample <= startSample + windowSize) {
        const markerX = ((trimEndSample - startSample) / windowSize) * width;
        ctx.strokeStyle = "#EF4444"; // Vivid red trim end marker
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(markerX, 0);
        ctx.lineTo(markerX, height);
        ctx.stroke();

        // Draw a handle block at the bottom
        ctx.fillStyle = "#EF4444";
        ctx.fillRect(markerX - 4, height - 8, 8, 8);
      }

      // Draw active playhead indicator if audio duration is present
      if (currentTime > 0 && audioDuration > 0) {
        const sampleRate = audioBufferRef.current.sampleRate;
        const currentSample = currentTime * sampleRate;
        if (currentSample >= startSample && currentSample <= startSample + windowSize) {
          const markerX = ((currentSample - startSample) / windowSize) * width;
          ctx.strokeStyle = "#4ADE80"; // Neon green playhead
          ctx.lineWidth = 2;
          ctx.shadowBlur = 6;
          ctx.shadowColor = "rgba(74, 222, 128, 0.5)";
          ctx.beginPath();
          ctx.moveTo(markerX, 0);
          ctx.lineTo(markerX, height);
          ctx.stroke();
        }
      }

      ctx.shadowBlur = 0;

      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      // Continue drawing to respond instantly to slider moves
      animationFrameRef.current = requestAnimationFrame(drawWaveform);
    } else {
      // Idle wave simulator (extremely cool, breathing microphone ambient)
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(142, 146, 153, 0.3)"; // Slate gray idle (#8E9299)
      ctx.shadowBlur = 0;
      
      ctx.beginPath();
      const points = 60;
      const step = width / points;
      const waveSpeed = Date.now() * 0.003;
      
      ctx.moveTo(0, height / 2);
      for (let i = 0; i <= points; i++) {
        const x = i * step;
        const sineMultiplier = Math.sin(i * 0.15 + waveSpeed);
        // breathe taller if audio is loaded but paused
        const amplitude = base64Audio ? 8 : 3;
        const y = height / 2 + sineMultiplier * amplitude;
        ctx.lineTo(x, y);
      }
      ctx.stroke();

      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      // Continue breathing animation
      animationFrameRef.current = requestAnimationFrame(drawWaveform);
    }
  };

  // Interactive drag-trim canvas handlers
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!audioBufferRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const ratioInViewport = mouseX / rect.width;

    const data = audioBufferRef.current.getChannelData(0);
    const windowSize = data.length / waveformZoom;
    const maxStart = data.length - windowSize;
    const startSample = Math.floor((waveformPan / 100) * maxStart);

    const mouseSample = startSample + ratioInViewport * windowSize;
    const mouseRatio = Math.max(0, Math.min(1, mouseSample / data.length));

    const distStart = Math.abs(mouseRatio - trimStartRatio);
    const distEnd = Math.abs(mouseRatio - trimEndRatio);

    const thresholdRatio = Math.max(0.01, (windowSize * 0.08) / data.length);

    if (distStart < distEnd && distStart < thresholdRatio) {
      setActiveDragHandle("start");
    } else if (distEnd < thresholdRatio) {
      setActiveDragHandle("end");
    } else {
      const clickThreshold = Math.max(0.01, (windowSize * 0.12) / data.length);
      if (distStart < distEnd && distStart < clickThreshold) {
        setActiveDragHandle("start");
      } else if (distEnd < clickThreshold) {
        setActiveDragHandle("end");
      }
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!activeDragHandle || !audioBufferRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const ratioInViewport = mouseX / rect.width;

    const data = audioBufferRef.current.getChannelData(0);
    const windowSize = data.length / waveformZoom;
    const maxStart = data.length - windowSize;
    const startSample = Math.floor((waveformPan / 100) * maxStart);

    const mouseSample = startSample + ratioInViewport * windowSize;
    const mouseRatio = Math.max(0, Math.min(1, mouseSample / data.length));

    if (activeDragHandle === "start") {
      setTrimStartRatio(Math.min(mouseRatio, trimEndRatio - 0.02));
    } else {
      setTrimEndRatio(Math.max(mouseRatio, trimStartRatio + 0.02));
    }
  };

  const handleCanvasMouseUpOrLeave = () => {
    setActiveDragHandle(null);
  };

  const handleCanvasTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 0 || !audioBufferRef.current) return;
    const touch = e.touches[0];
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = touch.clientX - rect.left;
    const ratioInViewport = mouseX / rect.width;

    const data = audioBufferRef.current.getChannelData(0);
    const windowSize = data.length / waveformZoom;
    const maxStart = data.length - windowSize;
    const startSample = Math.floor((waveformPan / 100) * maxStart);

    const mouseSample = startSample + ratioInViewport * windowSize;
    const mouseRatio = Math.max(0, Math.min(1, mouseSample / data.length));

    const distStart = Math.abs(mouseRatio - trimStartRatio);
    const distEnd = Math.abs(mouseRatio - trimEndRatio);

    const thresholdRatio = Math.max(0.01, (windowSize * 0.12) / data.length);

    if (distStart < distEnd && distStart < thresholdRatio) {
      setActiveDragHandle("start");
    } else if (distEnd < thresholdRatio) {
      setActiveDragHandle("end");
    }
  };

  const handleCanvasTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!activeDragHandle || e.touches.length === 0 || !audioBufferRef.current) return;
    const touch = e.touches[0];
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = touch.clientX - rect.left;
    const ratioInViewport = mouseX / rect.width;

    const data = audioBufferRef.current.getChannelData(0);
    const windowSize = data.length / waveformZoom;
    const maxStart = data.length - windowSize;
    const startSample = Math.floor((waveformPan / 100) * maxStart);

    const mouseSample = startSample + ratioInViewport * windowSize;
    const mouseRatio = Math.max(0, Math.min(1, mouseSample / data.length));

    if (activeDragHandle === "start") {
      setTrimStartRatio(Math.min(mouseRatio, trimEndRatio - 0.02));
    } else {
      setTrimEndRatio(Math.max(mouseRatio, trimStartRatio + 0.02));
    }
  };

  // Helper to compile a standard RIFF/WAVE header and initiate client download
  const downloadWav = () => {
    if (!base64Audio) return;

    try {
      const binaryString = window.atob(base64Audio);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      let pcm16 = new Int16Array(bytes.buffer);
      const sampleRate = 24000;

      // Apply the user's interactive drag trim boundaries!
      if (trimStartRatio > 0 || trimEndRatio < 1) {
        const startIndex = Math.floor(trimStartRatio * pcm16.length);
        const endIndex = Math.floor(trimEndRatio * pcm16.length);
        pcm16 = pcm16.subarray(startIndex, Math.min(endIndex, pcm16.length));
      }

      if (trimSilence) {
        const threshold = 300;
        let startOffset = 0;
        let endOffset = pcm16.length;
        for (let i = 0; i < pcm16.length; i++) {
          if (Math.abs(pcm16[i]) >= threshold) {
            startOffset = i;
            break;
          }
        }
        for (let i = pcm16.length - 1; i >= startOffset; i--) {
          if (Math.abs(pcm16[i]) >= threshold) {
            endOffset = i + 1;
            break;
          }
        }
        pcm16 = pcm16.subarray(startOffset, endOffset);
      }

      if (normalizeAudio) {
        const normFactor = getNormalizationFactor();
        const normalized = new Int16Array(pcm16.length);
        for (let i = 0; i < pcm16.length; i++) {
          let val = Math.round(pcm16[i] * normFactor);
          if (val > 32767) val = 32767;
          else if (val < -32768) val = -32768;
          normalized[i] = val;
        }
        pcm16 = normalized;
      }

      // 44-byte WAV header allocation
      const wavBuffer = new ArrayBuffer(44 + pcm16.length * 2);
      const view = new DataView(wavBuffer);

      // Helper to write ASCII strings to dataview
      const writeString = (view: DataView, offset: number, str: string) => {
        for (let i = 0; i < str.length; i++) {
          view.setUint8(offset + i, str.charCodeAt(i));
        }
      };

      writeString(view, 0, "RIFF");
      view.setUint32(4, 36 + pcm16.length * 2, true);
      writeString(view, 8, "WAVE");
      writeString(view, 12, "fmt ");
      view.setUint32(16, 16, true); // Format chunk size
      view.setUint16(20, 1, true);  // Uncompressed PCM audio format
      view.setUint16(22, 1, true);  // Mono channel
      view.setUint32(24, sampleRate, true); // 24000Hz rate
      view.setUint32(28, sampleRate * 2, true); // Byte rate (24000 * 2)
      view.setUint16(32, 2, true);  // Block align (1 channel * 2 bytes)
      view.setUint16(34, 16, true); // 16 bits per sample
      writeString(view, 36, "data");
      view.setUint32(40, pcm16.length * 2, true); // Data size

      // Append Int16 PCM samples
      for (let i = 0; i < pcm16.length; i++) {
        view.setInt16(44 + i * 2, pcm16[i], true);
      }

      const blob = new Blob([view], { type: "audio/wav" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `voiceover-${selectedVoice.toLowerCase()}-dry-studio.wav`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("WAV compile error:", e);
      setError("Could not compile audio to WAV format.");
    }
  };

  // Helper to compile MP3 using lamejs client-side library and initiate download
  const exportCompressedMp3 = () => {
    if (!base64Audio) return;
    setIsExportingMp3(true);
    setMp3ExportProgress(0);
    setError(null);

    // Run on timeout to allow UI loading spinner to render
    setTimeout(async () => {
      try {
        const binaryString = window.atob(base64Audio);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        let pcm16 = new Int16Array(bytes.buffer);
        const sampleRate = 24000;
        const channels = 1;
        const kbps = 192; // 192kbps MP3 requested

        if (trimSilence) {
          const threshold = 300;
          let startOffset = 0;
          let endOffset = pcm16.length;
          for (let i = 0; i < pcm16.length; i++) {
            if (Math.abs(pcm16[i]) >= threshold) {
              startOffset = i;
              break;
            }
          }
          for (let i = pcm16.length - 1; i >= startOffset; i--) {
            if (Math.abs(pcm16[i]) >= threshold) {
              endOffset = i + 1;
              break;
            }
          }
          pcm16 = pcm16.subarray(startOffset, endOffset);
        }

        if (normalizeAudio) {
          const normFactor = getNormalizationFactor();
          const normalized = new Int16Array(pcm16.length);
          for (let i = 0; i < pcm16.length; i++) {
            let val = Math.round(pcm16[i] * normFactor);
            if (val > 32767) val = 32767;
            else if (val < -32768) val = -32768;
            normalized[i] = val;
          }
          pcm16 = normalized;
        }

        // Get Mp3Encoder dynamically to support safe ESM modules & CommonJS transpiling
        const Mp3Encoder = (lamejs as any).Mp3Encoder || (lamejs as any).default?.Mp3Encoder;
        if (!Mp3Encoder) {
          throw new Error("LameJS Mp3Encoder was not found in the imported library.");
        }

        const encoder = new Mp3Encoder(channels, sampleRate, kbps);
        const mp3Data: any[] = [];
        const sampleBlockSize = 1152;

        const totalSamples = pcm16.length;
        let index = 0;

        const processChunk = async () => {
          // Process 10 blocks at a time (around 11,520 samples) to ensure responsiveness and smooth UI animation
          const chunkLimit = Math.min(index + sampleBlockSize * 10, totalSamples);
          for (let i = index; i < chunkLimit; i += sampleBlockSize) {
            const sampleChunk = pcm16.subarray(i, i + sampleBlockSize);
            let chunkToEncode = sampleChunk;
            
            // Pad last block with zeros if it is not a multiple of sampleBlockSize (1152)
            if (sampleChunk.length < sampleBlockSize) {
              chunkToEncode = new Int16Array(sampleBlockSize);
              chunkToEncode.set(sampleChunk);
            }
            
            const mp3buf = encoder.encodeBuffer(chunkToEncode);
            if (mp3buf.length > 0) {
              mp3Data.push(mp3buf);
            }
          }
          
          index = chunkLimit;
          const pct = Math.min(99, Math.round((index / totalSamples) * 100));
          setMp3ExportProgress(pct);

          if (index < totalSamples) {
            await new Promise((resolve) => setTimeout(resolve, 10));
            await processChunk();
          }
        };

        await processChunk();

        const mp3buf = encoder.flush();
        if (mp3buf.length > 0) {
          mp3Data.push(mp3buf);
        }
        setMp3ExportProgress(100);

        // Quick pause to show 100% complete
        await new Promise((resolve) => setTimeout(resolve, 100));

        const blob = new Blob(mp3Data, { type: "audio/mp3" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `voiceover-${selectedVoice.toLowerCase()}-dry-studio.mp3`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (e) {
        console.error("MP3 compile error:", e);
        setError("Could not compile audio to 192kbps MP3 format.");
      } finally {
        setIsExportingMp3(false);
        setMp3ExportProgress(0);
      }
    }, 100);
  };

  // Helper to compile OGG (Vorbis / WebM) client-side and initiate download
  const exportCompressedOgg = () => {
    if (!base64Audio) return;
    setIsExportingOgg(true);
    setOggExportProgress(0);
    setError(null);

    // Run on timeout to allow UI loading spinner to render
    setTimeout(async () => {
      try {
        const binaryString = window.atob(base64Audio);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        let pcm16 = new Int16Array(bytes.buffer);
        const sampleRate = 24000;

        // Apply the user's interactive drag trim boundaries
        if (trimStartRatio > 0 || trimEndRatio < 1) {
          const startIndex = Math.floor(trimStartRatio * pcm16.length);
          const endIndex = Math.floor(trimEndRatio * pcm16.length);
          pcm16 = pcm16.subarray(startIndex, Math.min(endIndex, pcm16.length));
        }

        if (trimSilence) {
          const threshold = 300;
          let startOffset = 0;
          let endOffset = pcm16.length;
          for (let i = 0; i < pcm16.length; i++) {
            if (Math.abs(pcm16[i]) >= threshold) {
              startOffset = i;
              break;
            }
          }
          for (let i = pcm16.length - 1; i >= startOffset; i--) {
            if (Math.abs(pcm16[i]) >= threshold) {
              endOffset = i + 1;
              break;
            }
          }
          pcm16 = pcm16.subarray(startOffset, endOffset);
        }

        if (normalizeAudio) {
          const normFactor = getNormalizationFactor();
          const normalized = new Int16Array(pcm16.length);
          for (let i = 0; i < pcm16.length; i++) {
            let val = Math.round(pcm16[i] * normFactor);
            if (val > 32767) val = 32767;
            else if (val < -32768) val = -32768;
            normalized[i] = val;
          }
          pcm16 = normalized;
        }

        // Convert PCM Int16 samples to Float32 for standard Web Audio API
        const float32 = new Float32Array(pcm16.length);
        for (let i = 0; i < pcm16.length; i++) {
          float32[i] = pcm16[i] / 32768.0;
        }

        // Try using modern MediaRecorder stream playback if supported by browser
        let mimeType = "audio/ogg";
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")
            ? "audio/ogg;codecs=opus"
            : MediaRecorder.isTypeSupported("audio/webm")
              ? "audio/webm"
              : "";
        }

        if (mimeType && (window.AudioContext || (window as any).webkitAudioContext)) {
          const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
          const buffer = ctx.createBuffer(1, float32.length, sampleRate);
          buffer.getChannelData(0).set(float32);

          const source = ctx.createBufferSource();
          source.buffer = buffer;

          const dest = ctx.createMediaStreamDestination();
          source.connect(dest);

          const recorder = new MediaRecorder(dest.stream, { mimeType });
          const chunks: Blob[] = [];

          recorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) {
              chunks.push(e.data);
            }
          };

          recorder.onstop = () => {
            const extension = mimeType.includes("ogg") ? "ogg" : "webm";
            const blob = new Blob(chunks, { type: mimeType });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `voiceover-${selectedVoice.toLowerCase()}-dry-studio.${extension}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            setIsExportingOgg(false);
            setOggExportProgress(100);
          };

          // Simulate encoding progress based on audio duration
          const duration = float32.length / sampleRate;
          let elapsed = 0;
          const interval = setInterval(() => {
            elapsed += 0.2;
            const pct = Math.min(99, Math.round((elapsed / duration) * 100));
            setOggExportProgress(pct);
            if (elapsed >= duration) {
              clearInterval(interval);
            }
          }, 200);

          recorder.start();
          source.start(0);

          setTimeout(() => {
            recorder.stop();
            ctx.close();
          }, (duration * 1000) + 150);

        } else {
          // Absolute fallback if MediaRecorder is missing: package as a valid WAV labeled .ogg or standard blob
          const wavBuffer = new ArrayBuffer(44 + pcm16.length * 2);
          const view = new DataView(wavBuffer);
          const writeString = (view: DataView, offset: number, str: string) => {
            for (let i = 0; i < str.length; i++) {
              view.setUint8(offset + i, str.charCodeAt(i));
            }
          };

          writeString(view, 0, "RIFF");
          view.setUint32(4, 36 + pcm16.length * 2, true);
          writeString(view, 8, "WAVE");
          writeString(view, 12, "fmt ");
          view.setUint32(16, 16, true);
          view.setUint16(20, 1, true);
          view.setUint16(22, 1, true);
          view.setUint32(24, sampleRate, true);
          view.setUint32(28, sampleRate * 2, true);
          view.setUint16(32, 2, true);
          view.setUint16(34, 16, true);
          writeString(view, 36, "data");
          view.setUint32(40, pcm16.length * 2, true);

          for (let i = 0; i < pcm16.length; i++) {
            view.setInt16(44 + i * 2, pcm16[i], true);
          }

          const blob = new Blob([view], { type: "audio/ogg" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `voiceover-${selectedVoice.toLowerCase()}-dry-studio.ogg`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          setOggExportProgress(100);
          setIsExportingOgg(false);
        }
      } catch (e) {
        console.error("OGG compile error:", e);
        setError("Could not compile audio to OGG format.");
        setIsExportingOgg(false);
      }
    }, 100);
  };

  // Load a preset script or text blocks
  const loadPresetText = (type: "full" | "short1" | "short2") => {
    if (type === "full") {
      setText(DEFAULT_SCRIPT);
    } else if (type === "short1") {
      setText(
        "Engineering teams at mid-market companies deploy frequently. Typically, with 50 to 500 engineers. However, they often operate without critical visibility. Today, deployment incidents are correlated manually."
      );
    } else if (type === "short2") {
      setText(
        "DORA metrics remain trapped in static, quarterly spreadsheets. Worst of all, supply chain vulnerabilities allow malicious packages to steal credentials during CI/CD. All of this happens without leaving a trace."
      );
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0C0E] text-[#D1D5DB] font-sans selection:bg-[#4ADE80]/20 selection:text-white bg-grid-dots flex flex-col">
      
      {/* Recent Voice Configurations Sidebar Drawer */}
      <AnimatePresence>
        {isSidebarOpen && (
          <div className="fixed inset-0 z-[100] overflow-hidden flex justify-start">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSidebarOpen(false)}
              className="absolute inset-0 bg-[#0B0C0E]/80 backdrop-blur-sm cursor-pointer"
            />
            
            {/* Drawer Body */}
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 220 }}
              className="relative w-80 md:w-96 bg-[#0F1115] border-r border-[#2D3036] shadow-[10px_0_30px_rgba(0,0,0,0.6)] flex flex-col h-full overflow-hidden"
              id="sidebar-preset-memories"
            >
              {/* Highlight bar at top */}
              <div className="h-[3px] bg-[#4ADE80] w-full" />
              
              {/* Sidebar Header */}
              <div className="p-4 border-b border-[#2D3036] bg-[#0B0C0E]/40 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <History className="h-4 w-4 text-[#4ADE80]" />
                  <div>
                    <h3 className="text-xs uppercase font-mono font-bold tracking-widest text-white">
                      Preset Memory Bank
                    </h3>
                    <p className="text-[9px] text-[#5C616A] font-mono">RECALL PREVIOUS VOICE SETUPS</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsSidebarOpen(false)}
                  className="text-xs text-[#8E9299] hover:text-white font-mono uppercase tracking-widest hover:underline cursor-pointer"
                >
                  [Close]
                </button>
              </div>

              {/* Sidebar Scrollable Area */}
              <div className="flex-grow p-4 overflow-y-auto space-y-5">
                
                {/* Temporary Notification / Toast inside Sidebar */}
                {recallNotification && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="p-2.5 bg-[#4ADE80]/10 border border-[#4ADE80]/30 rounded text-[#4ADE80] text-[9.5px] font-mono uppercase tracking-wider text-center"
                  >
                    {recallNotification}
                  </motion.div>
                )}

                {/* Section: Current Active Setup */}
                <div className="space-y-2 bg-[#121418] border border-[#2D3036]/80 rounded p-3 font-mono">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-[#4ADE80] font-bold uppercase tracking-wider">
                      Current Live Setup
                    </span>
                    <button
                      onClick={() => {
                        const currentVoice = isComparisonMode 
                          ? (activeComparisonSlot === "A" ? comparisonVoiceA : comparisonVoiceB) 
                          : selectedVoice;
                        saveVoiceConfig(currentVoice, toneDescription, pitchShift);
                        setRecallNotification(`Saved: ${currentVoice} setup!`);
                        setTimeout(() => setRecallNotification(null), 2500);
                      }}
                      className="text-[9px] text-white hover:text-[#4ADE80] bg-[#1A1C20] border border-[#2D3036] hover:border-[#4ADE80]/40 px-2 py-1 rounded transition-colors flex items-center gap-1 cursor-pointer uppercase font-bold"
                      title="Save current voice config to memories list"
                    >
                      <Save className="h-3 w-3" />
                      Save Memory
                    </button>
                  </div>
                  
                  <div className="space-y-1.5 text-[11px] text-[#8E9299] pt-1">
                    <div className="flex items-center justify-between">
                      <span>Transducer (Voice):</span>
                      <span className="text-white font-bold">
                        {isComparisonMode 
                          ? `${activeComparisonSlot === "A" ? comparisonVoiceA : comparisonVoiceB} (Slot ${activeComparisonSlot})` 
                          : selectedVoice
                        }
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Analogue Pitch:</span>
                      <span className={`font-bold ${pitchShift === 0 ? "text-[#8E9299]" : pitchShift > 0 ? "text-[#4ADE80]" : "text-[#F87171]"}`}>
                        {pitchShift > 0 ? `+${pitchShift}` : pitchShift}%
                      </span>
                    </div>
                    <div className="flex flex-col gap-1 pt-1 border-t border-[#2D3036]/30">
                      <span>Acoustic Tone Directives:</span>
                      <span className="text-[10px] text-slate-300 font-sans italic line-clamp-2 bg-[#0B0C0E] p-1.5 rounded border border-[#2D3036]/40 leading-relaxed">
                        {toneDescription}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Section: Saved Memories (Last 5) */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-[#2D3036] pb-1.5">
                    <span className="text-[10px] text-[#8E9299] font-mono font-bold uppercase tracking-wider">
                      Stored Profiles ({recentConfigs.length}/5)
                    </span>
                    {recentConfigs.length > 0 && (
                      <button
                        onClick={() => {
                          if (window.confirm("Clear all voice preset memories?")) {
                            setRecentConfigs([]);
                          }
                        }}
                        className="text-[9px] text-[#FF4444] hover:underline font-mono uppercase tracking-wider"
                      >
                        [Clear All]
                      </button>
                    )}
                  </div>

                  {recentConfigs.length === 0 ? (
                    <div className="py-8 text-center text-[#5C616A] uppercase font-mono text-[10px] leading-relaxed">
                      No configurations saved.<br/>
                      Presets save automatically on successful generation, or click 'Save Memory' above.
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {recentConfigs.map((config, index) => {
                        const voiceDetails = VOICES.find(v => v.name === config.voiceName);
                        return (
                          <div
                            key={config.id}
                            className="bg-[#121418] border border-[#2D3036]/60 rounded-lg p-3 hover:border-[#4ADE80]/30 transition-all group flex flex-col justify-between gap-3 font-mono relative overflow-hidden"
                          >
                            {/* Memory index tag */}
                            <div className="absolute top-0 right-0 bg-[#2D3036]/60 text-[#8E9299] text-[8px] font-bold px-1.5 py-0.5 rounded-bl">
                              M0{index + 1}
                            </div>

                            <div className="space-y-2">
                              {/* Voice Name and Pitch */}
                              <div className="flex items-center gap-2">
                                <span className="text-white font-bold text-xs">
                                  {config.voiceName}
                                </span>
                                <span className={`text-[8.5px] px-1.5 py-0.2 rounded font-mono uppercase ${
                                  voiceDetails?.gender === "Male" ? "bg-blue-500/10 text-blue-400 border border-blue-500/20" :
                                  voiceDetails?.gender === "Female" ? "bg-rose-500/10 text-rose-400 border border-rose-500/20" :
                                  "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                                }`}>
                                  {voiceDetails?.gender || "Voice"}
                                </span>
                                <span className={`text-[9px] ml-auto font-bold ${config.pitchShift === 0 ? "text-[#5C616A]" : config.pitchShift > 0 ? "text-[#4ADE80]" : "text-[#F87171]"}`}>
                                  {config.pitchShift > 0 ? `+${config.pitchShift}` : config.pitchShift}% pitch
                                </span>
                              </div>

                              {/* Tone Description preview */}
                              <p 
                                className="text-[10px] text-[#8E9299] font-sans italic line-clamp-2 leading-relaxed bg-[#0B0C0E]/50 p-2 rounded border border-[#2D3036]/30 group-hover:text-slate-200 transition-colors"
                                title={config.toneDescription}
                              >
                                {config.toneDescription}
                              </p>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center justify-between gap-2 border-t border-[#2D3036]/40 pt-2 bg-[#121418]">
                              <button
                                onClick={() => handleLoadConfig(config)}
                                className="flex-grow py-1.5 px-3 bg-[#4ADE80]/10 hover:bg-[#4ADE80] text-[#4ADE80] hover:text-[#0B0C0E] border border-[#4ADE80]/30 hover:border-none rounded font-mono text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer text-center"
                              >
                                Recall Memory Setup
                              </button>
                              <button
                                onClick={() => setRecentConfigs(prev => prev.filter(c => c.id !== config.id))}
                                className="p-1.5 hover:bg-[#FF4444]/10 text-[#5C616A] hover:text-[#FF4444] rounded border border-transparent hover:border-[#FF4444]/20 transition-colors cursor-pointer"
                                title="Delete memory"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

              </div>
              
              {/* Footer */}
              <div className="p-3 bg-[#0B0C0E] border-t border-[#2D3036] text-center text-[8px] font-mono text-[#5C616A] uppercase tracking-wider">
                Recall system fully calibrated
              </div>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      {/* Top Console Header Bar (Sophisticated Dark aesthetic) */}
      <header className="h-16 border-b border-[#2D3036] flex items-center justify-between px-6 bg-[#0F1115] sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-[#4ADE80] shadow-[0_0_8px_rgba(74,222,128,0.6)] animate-pulse"></div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] tracking-widest text-[#8E9299] uppercase hidden sm:inline">
              Recording Session: 24-05-ADTR
            </span>
            <span className="h-4 w-[1px] bg-[#2D3036] hidden sm:inline"></span>
            <span className="text-xs font-mono font-bold text-[#4ADE80] tracking-wider">
              DRY STUDIO 24.0kHz
            </span>
          </div>
        </div>

        <div className="text-center">
          <h1 className="text-xs sm:text-sm font-medium tracking-[0.2em] uppercase text-white font-display">
            Engineering Visibility Audit
          </h1>
        </div>

        <div className="flex items-center gap-4 font-mono text-[10px] text-[#8E9299]">
          <span className="hidden md:inline">BUFFER: 512ms</span>
          <span className="bg-[#1A1C20] px-2 py-0.5 rounded border border-[#2D3036] text-white">
            16-bit / Mono
          </span>
        </div>
      </header>

      {/* Shared audio loading overlay or banner */}
      <AnimatePresence>
        {isLoadingShared && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-blue-950/30 border-b border-blue-500/30 text-blue-400 p-4 flex items-center justify-center gap-3 font-mono text-xs z-40 shadow-[0_4px_12px_rgba(0,0,0,0.5)] overflow-hidden"
          >
            <RefreshCw className="h-4 w-4 animate-spin text-blue-400" />
            <span className="font-bold text-white tracking-wide uppercase">Retrieving Shared Voiceover Data...</span>
            <span className="text-slate-300">Please wait while we load the generated voice model from the cloud...</span>
          </motion.div>
        )}
        {sharedLoadError && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-rose-950/20 border-b border-rose-500/30 text-rose-400 p-4 flex items-center justify-center gap-3 font-mono text-xs z-40 overflow-hidden"
          >
            <AlertCircle className="h-4 w-4 text-rose-500" />
            <span className="font-bold text-white tracking-wide uppercase">Share Link Error:</span>
            <span>{sharedLoadError}</span>
            <button
              onClick={() => setSharedLoadError(null)}
              className="ml-4 px-2 py-0.5 bg-rose-900/30 border border-rose-500/30 text-rose-300 rounded hover:bg-rose-800/30 text-[10px] cursor-pointer"
            >
              Dismiss
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Single-View Application Stage */}
      <main className="max-w-7xl mx-auto w-full p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 flex-grow">
        
        {/* Left Side: Voice controls rack (Col-span 5) */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* Rack Panel 1: Voice Setup */}
          <section className="bg-[#0F1115] border border-[#2D3036] rounded p-5 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 h-[3px] w-16 bg-[#4ADE80]" />
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Radio className="h-4 w-4 text-[#4ADE80]" />
                <h2 className="text-[10px] uppercase tracking-widest text-[#5C616A] font-mono font-bold">
                  01 / Voice & Acoustic Signal Chain
                </h2>
              </div>
              <button
                onClick={() => setIsSidebarOpen(true)}
                className="flex items-center gap-1.5 text-[9px] font-mono text-[#4ADE80] bg-[#4ADE80]/10 hover:bg-[#4ADE80]/20 border border-[#4ADE80]/30 hover:border-[#4ADE80]/60 px-2.5 py-1.5 rounded transition-all uppercase tracking-wider cursor-pointer font-bold"
                id="btn-open-preset-memories"
                title="Recall previous voice configs"
              >
                <History className="h-3.5 w-3.5 text-[#4ADE80]" />
                <span>Recall Presets</span>
              </button>
            </div>

            {/* Tactical Mode Selector */}
            <div className="grid grid-cols-2 gap-2 mb-4 bg-[#0B0C0E] p-1 rounded border border-[#2D3036] text-[10px] font-mono uppercase tracking-widest">
              <button
                onClick={() => {
                  setIsComparisonMode(false);
                  stopAudio();
                  setBase64Audio(null);
                  setAudioDuration(0);
                  setSilenceReport(null);
                }}
                className={`py-2 px-3 rounded text-center font-bold cursor-pointer transition-all ${
                  !isComparisonMode 
                    ? "bg-[#4ADE80] text-[#0B0C0E] shadow-[0_0_8px_rgba(74,222,128,0.4)]" 
                    : "text-[#8E9299] hover:text-white"
                }`}
                id="btn-mode-single"
              >
                Single Voice
              </button>
              <button
                onClick={() => {
                  setIsComparisonMode(true);
                  stopAudio();
                  setBase64Audio(null);
                  setAudioDuration(0);
                  setSilenceReport(null);
                }}
                className={`py-2 px-3 rounded text-center font-bold cursor-pointer transition-all ${
                  isComparisonMode 
                    ? "bg-[#4ADE80] text-[#0B0C0E] shadow-[0_0_8px_rgba(74,222,128,0.4)]" 
                    : "text-[#8E9299] hover:text-white"
                }`}
                id="btn-mode-comparison"
              >
                A/B Compare
              </button>
            </div>

            {/* Slot Selector under Comparison Mode */}
            {isComparisonMode && (
              <div className="grid grid-cols-2 gap-2 mb-4 p-1 bg-[#121418] border border-[#2D3036]/60 rounded font-mono text-[9px] uppercase tracking-wider">
                <button
                  onClick={() => setActiveComparisonSlot("A")}
                  className={`py-2 px-2.5 rounded flex flex-col items-center gap-0.5 border cursor-pointer transition-all ${
                    activeComparisonSlot === "A"
                      ? "bg-[#4ADE80]/10 border-[#4ADE80] text-[#4ADE80]"
                      : "bg-transparent border-transparent text-[#8E9299] hover:text-white"
                  }`}
                  id="btn-active-slot-a"
                >
                  <span className="font-bold">Slot A (Dry Signal)</span>
                  <span className="text-[11px] font-display font-medium text-white">{comparisonVoiceA}</span>
                </button>
                <button
                  onClick={() => setActiveComparisonSlot("B")}
                  className={`py-2 px-2.5 rounded flex flex-col items-center gap-0.5 border cursor-pointer transition-all ${
                    activeComparisonSlot === "B"
                      ? "bg-[#4ADE80]/10 border-[#4ADE80] text-[#4ADE80]"
                      : "bg-transparent border-transparent text-[#8E9299] hover:text-white"
                  }`}
                  id="btn-active-slot-b"
                >
                  <span className="font-bold">Slot B (A/B Test)</span>
                  <span className="text-[11px] font-display font-medium text-white">{comparisonVoiceB}</span>
                </button>
              </div>
            )}

            {/* Prebuilt Voice List */}
            <div className="space-y-2.5">
              <label className="text-[10px] text-[#8E9299] font-mono block uppercase tracking-wider">
                {isComparisonMode 
                  ? `Select Voice for Active Slot ${activeComparisonSlot}:` 
                  : "Select Studio Voice Transducer:"
                }
              </label>
              <div className="grid grid-cols-1 gap-2">
                {VOICES.map((voice) => {
                  const isSelected = isComparisonMode
                    ? (activeComparisonSlot === "A" ? comparisonVoiceA === voice.name : comparisonVoiceB === voice.name)
                    : selectedVoice === voice.name;

                  const isVoiceA = isComparisonMode && comparisonVoiceA === voice.name;
                  const isVoiceB = isComparisonMode && comparisonVoiceB === voice.name;

                  return (
                    <button
                      key={voice.name}
                      onClick={() => {
                        if (isComparisonMode) {
                          if (activeComparisonSlot === "A") {
                            setComparisonVoiceA(voice.name);
                          } else {
                            setComparisonVoiceB(voice.name);
                          }
                        } else {
                          setSelectedVoice(voice.name);
                        }
                      }}
                      className={`text-left p-3 rounded border transition-all relative flex items-center justify-between group ${
                        isSelected 
                          ? "bg-[#15171C] border-[#4ADE80] text-white glow-green-subtle" 
                          : isVoiceA || isVoiceB
                            ? "bg-[#111317]/80 border-[#4ADE80]/30 text-white/90"
                            : "bg-[#0B0C0E]/60 border-[#2D3036] hover:border-[#5C616A] text-[#8E9299] hover:text-white"
                      }`}
                      id={`btn-voice-${voice.name.toLowerCase()}`}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-display font-medium text-sm">{voice.name}</span>
                          <span className={`text-[9px] px-1.5 py-0.2 rounded font-mono uppercase ${
                            voice.gender === "Male" ? "bg-blue-500/10 text-blue-400 border border-blue-500/20" :
                            voice.gender === "Female" ? "bg-rose-500/10 text-rose-400 border border-rose-500/20" :
                            "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                          }`}>
                            {voice.gender}
                          </span>
                          {isComparisonMode && (
                            <div className="flex items-center gap-1 ml-1.5">
                              {isVoiceA && (
                                <span className="text-[8.5px] px-1 bg-[#4ADE80]/10 text-[#4ADE80] border border-[#4ADE80]/30 rounded font-mono font-bold">
                                  SLOT A
                                </span>
                              )}
                              {isVoiceB && (
                                <span className="text-[8.5px] px-1 bg-purple-500/10 text-purple-400 border border-purple-500/30 rounded font-mono font-bold">
                                  SLOT B
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        <p className="text-xs text-[#5C616A] mt-1 line-clamp-1 font-mono">{voice.description}</p>
                      </div>
                      <div className="flex items-center">
                        {isSelected ? (
                          <div className="h-4 w-4 rounded-full bg-[#4ADE80]/20 border border-[#4ADE80] flex items-center justify-center">
                            <Check className="h-2.5 w-2.5 text-[#4ADE80]" />
                          </div>
                        ) : (
                          <div className="h-4 w-4 rounded-full border border-[#2D3036] group-hover:border-[#5C616A]" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Custom tone / directives input */}
            <div className="mt-5 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] text-[#8E9299] font-mono block uppercase tracking-wider">
                  Style & Acoustics Parameters:
                </label>
                <button 
                  onClick={() => setToneDescription("completely dry recording studio format, medium-low tone, consistent rhythm with varied vocal cadence, introducing natural minor pauses and subtle shifts in speaking speed to enhance realism")}
                  className="text-[9px] text-[#4ADE80] hover:underline font-mono uppercase tracking-wider"
                  title="Restore dry studio parameters"
                >
                  [Reset Dry Filter]
                </button>
              </div>
              
              <textarea
                value={toneDescription}
                onChange={(e) => setToneDescription(e.target.value)}
                rows={3}
                className="w-full bg-[#0B0C0E] border border-[#2D3036] rounded p-2.5 text-xs text-slate-200 font-sans focus:outline-none focus:border-[#4ADE80]/40 transition-colors placeholder:text-slate-600 resize-none"
                placeholder="Acoustic styles..."
                id="text-style-directive"
              />
              <p className="text-[10px] text-[#5C616A] italic font-mono leading-tight">
                Controls room acoustics, breath frequency, tempo multipliers and pitch parameters.
              </p>
            </div>
          </section>

          {/* Rack Panel 2: Live console dials (Stylized visual sliders) */}
          <section className="bg-[#0F1115] border border-[#2D3036] rounded p-5 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 h-[3px] w-16 bg-blue-500/60" />
            <div className="flex items-center gap-2 mb-4">
              <SlidersHorizontal className="h-4 w-4 text-blue-400" />
              <h2 className="text-[10px] uppercase tracking-widest text-[#5C616A] font-mono font-bold">
                02 / Analogue Console Parameters
              </h2>
            </div>

            <div className="space-y-4">
              
              {/* Speed Preset selectors */}
              <div>
                <label className="text-[10px] text-[#8E9299] font-mono block mb-2 uppercase tracking-wider">
                  Playback Tempo Multiplier:
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[0.8, 1.0, 1.2, 1.5].map((speed) => (
                    <button
                      key={speed}
                      onClick={() => handleSpeedChange(speed)}
                      className={`py-1.5 rounded text-xs font-mono border transition-colors ${
                        playbackSpeed === speed
                          ? "bg-blue-500/10 border-blue-500/40 text-blue-400"
                          : "bg-[#0B0C0E] border-[#2D3036] hover:border-[#5C616A] text-[#8E9299]"
                      }`}
                      id={`btn-speed-${speed}`}
                    >
                      {speed}x
                    </button>
                  ))}
                </div>
              </div>

              {/* Pitch Shift Slider */}
              <div className="border-t border-[#2D3036] pt-3">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[10px] text-[#8E9299] font-mono uppercase tracking-wider">
                    Analogue Pitch Shift:
                  </label>
                  <span className={`text-[10px] font-mono font-bold ${pitchShift === 0 ? "text-[#5C616A]" : pitchShift > 0 ? "text-[#4ADE80]" : "text-[#F87171]"}`}>
                    {pitchShift > 0 ? `+${pitchShift}` : pitchShift}%
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[9px] text-[#5C616A] font-mono w-6 text-right">-15%</span>
                  <input
                    type="range"
                    min="-15"
                    max="15"
                    step="1"
                    value={pitchShift}
                    onChange={(e) => handlePitchChange(parseInt(e.target.value))}
                    className="flex-grow h-1.5 bg-[#0B0C0E] rounded border border-[#2D3036] appearance-none cursor-pointer accent-[#4ADE80] hover:border-[#5C616A] transition-colors"
                    id="slider-pitch-shift"
                  />
                  <span className="text-[9px] text-[#5C616A] font-mono w-6">+15%</span>
                </div>
                <div className="flex justify-between items-center mt-1">
                  <span className="text-[8px] text-[#5C616A] font-mono italic">
                    Fine-tune signal frequency texture
                  </span>
                  <button
                    onClick={() => handlePitchChange(0)}
                    disabled={pitchShift === 0}
                    className="text-[8px] text-[#4ADE80] hover:underline font-mono uppercase tracking-widest disabled:opacity-0 disabled:pointer-events-none transition-opacity"
                  >
                    [Bypass Pitch]
                  </button>
                </div>
              </div>

              {/* Pitch Tone helper indicators */}
              <div className="border-t border-[#2D3036] pt-3">
                <span className="text-[10px] text-[#8E9299] font-mono block mb-1.5 uppercase tracking-wider">
                  Hardware Filter Presets:
                </span>
                <div className="bg-[#0B0C0E] border border-[#2D3036] p-3 rounded text-xs space-y-2">
                  <div className="flex items-center justify-between text-[#8E9299]">
                    <span>Target Acoustic:</span>
                    <span className="text-[#4ADE80] font-mono text-[11px]">Completely Dry</span>
                  </div>
                  <div className={`flex items-center justify-between ${selectedVoice === "Charon" || selectedVoice === "Fenrir" ? "text-[#4ADE80]" : "text-[#8E9299]"}`}>
                    <span>Pitch Alignment:</span>
                    <span className="font-mono text-[11px]">
                      {selectedVoice === "Charon" || selectedVoice === "Fenrir" ? "Medium-Low (Calibrated)" : "Standard (Warm)"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[#8E9299]">
                    <span>Reading Cadence:</span>
                    <span className="text-blue-400 font-mono text-[11px]">Steady / Rhythmic</span>
                  </div>
                </div>
              </div>

            </div>
          </section>

          {/* Quick presets for script loading */}
          <div className="flex gap-2 justify-between items-center bg-[#0F1115] border border-[#2D3036] p-3 rounded">
            <span className="text-[10px] text-[#5C616A] font-mono uppercase tracking-wider">Quick Presets:</span>
            <div className="flex gap-1.5">
              <button
                onClick={() => loadPresetText("full")}
                className="text-[10px] bg-[#15171C] hover:bg-[#1C1F26] border border-[#2D3036] hover:border-[#5C616A] px-2 py-1 rounded text-white transition-colors font-mono"
              >
                Full Audit
              </button>
              <button
                onClick={() => loadPresetText("short1")}
                className="text-[10px] bg-[#15171C] hover:bg-[#1C1F26] border border-[#2D3036] hover:border-[#5C616A] px-2 py-1 rounded text-white transition-colors font-mono"
              >
                Block A
              </button>
              <button
                onClick={() => loadPresetText("short2")}
                className="text-[10px] bg-[#15171C] hover:bg-[#1C1F26] border border-[#2D3036] hover:border-[#5C616A] px-2 py-1 rounded text-white transition-colors font-mono"
              >
                Block B
              </button>
            </div>
          </div>

          {/* Premium Feature 3: Master DSP Effects Rack */}
          <section className="bg-[#0F1115] border border-[#2D3036] rounded p-5 shadow-xl relative overflow-hidden space-y-4">
            <div className="absolute top-0 right-0 h-[3px] w-20 bg-amber-500/60" />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-400" />
                <h2 className="text-[10px] uppercase tracking-widest text-[#5C616A] font-mono font-bold">
                  05 / Master DSP Effects Rack
                </h2>
              </div>
              <span className="text-[8px] font-mono bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded border border-amber-500/20 font-bold uppercase tracking-widest">
                Premium DSP
              </span>
            </div>

            {/* Equalizer Panel */}
            <div className="bg-[#0B0C0E] border border-[#2D3036]/60 rounded p-3 space-y-3.5">
              <div className="flex items-center justify-between border-b border-[#2D3036]/40 pb-1.5">
                <span className="text-[10px] text-slate-300 font-mono font-bold uppercase tracking-wider">Vocal Equalizer (2-Band Shelf)</span>
                <button
                  onClick={() => {
                    setDspBassBoost(0);
                    setDspTrebleBoost(0);
                  }}
                  className="text-[9px] text-amber-400 hover:underline font-mono uppercase tracking-wider cursor-pointer"
                  disabled={dspBassBoost === 0 && dspTrebleBoost === 0}
                >
                  [Reset EQ]
                </button>
              </div>

              {/* Interactive Visual EQ Graph */}
              <InteractiveEQCurve
                bassBoost={dspBassBoost}
                setBassBoost={setDspBassBoost}
                trebleBoost={dspTrebleBoost}
                setTrebleBoost={setDspTrebleBoost}
              />
            </div>

            {/* Compressor & Reverb Panel */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Dynamic Compressor */}
              <div className="bg-[#0B0C0E] border border-[#2D3036]/60 rounded p-3 flex flex-col justify-between gap-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-300 font-mono font-bold uppercase tracking-wider">Dynamic Leveler</span>
                  <span className={`h-1.5 w-1.5 rounded-full ${dspCompressorEnabled ? "bg-[#4ADE80] animate-pulse" : "bg-[#5C616A]"}`} />
                </div>
                <p className="text-[9px] text-[#8E9299] font-mono leading-relaxed">
                  Studio grade automatic makeup compressor to level vocal peaks.
                </p>
                <button
                  onClick={() => setDspCompressorEnabled(!dspCompressorEnabled)}
                  className={`w-full py-1.5 rounded font-mono text-[9px] font-bold uppercase tracking-wider border transition-all cursor-pointer ${
                    dspCompressorEnabled
                      ? "bg-[#4ADE80]/10 border-[#4ADE80]/40 text-[#4ADE80]"
                      : "bg-[#1A1C20] border-[#2D3036] text-[#5C616A] hover:border-[#5C616A] hover:text-[#8E9299]"
                  }`}
                >
                  {dspCompressorEnabled ? "Compressor: ON" : "Compressor: BYPASS"}
                </button>
              </div>

              {/* Studio Reverb/Ambience */}
              <div className="bg-[#0B0C0E] border border-[#2D3036]/60 rounded p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-300 font-mono font-bold uppercase tracking-wider">Room Ambience</span>
                  <span className={`h-1.5 w-1.5 rounded-full ${dspReverbMix > 0 ? "bg-amber-400 animate-pulse" : "bg-[#5C616A]"}`} />
                </div>
                <div className="flex items-center justify-between text-[9.5px] font-mono text-[#8E9299]">
                  <span>Wet Reverb Mix:</span>
                  <span className={dspReverbMix > 0 ? "text-amber-400 font-bold" : "text-[#5C616A]"}>
                    {dspReverbMix}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="60"
                  step="5"
                  value={dspReverbMix}
                  onChange={(e) => setDspReverbMix(parseInt(e.target.value))}
                  className="w-full h-1 bg-[#1A1C20] rounded-lg appearance-none cursor-pointer accent-amber-400"
                />
                <p className="text-[8.5px] text-[#5C616A] font-mono text-center">
                  {dspReverbMix > 0 ? "Adds high-fidelity acoustic room depth" : "Dry vocal channel"}
                </p>
              </div>
            </div>

            {/* Reverb Advanced Parameters Expanded */}
            <AnimatePresence>
              {dspReverbMix > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="bg-[#0B0C0E] border border-[#2D3036]/60 rounded p-3 space-y-3 font-mono">
                    <span className="text-[9px] text-[#8E9299] uppercase tracking-widest font-bold block border-b border-[#2D3036]/30 pb-1">
                      Advanced Room Acoustics
                    </span>

                    <div className="grid grid-cols-2 gap-3">
                      {/* Decay time */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[9px] text-[#8E9299]">
                          <span>Reflections Delay:</span>
                          <span className="text-amber-400 font-bold">{Math.round(dspReverbDelayTime * 1000)}ms</span>
                        </div>
                        <input
                          type="range"
                          min="0.05"
                          max="0.40"
                          step="0.01"
                          value={dspReverbDelayTime}
                          onChange={(e) => setDspReverbDelayTime(parseFloat(e.target.value))}
                          className="w-full h-1 bg-[#1A1C20] rounded appearance-none cursor-pointer accent-amber-400"
                        />
                      </div>

                      {/* Feedback Decay */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[9px] text-[#8E9299]">
                          <span>Feedback Decay:</span>
                          <span className="text-amber-400 font-bold">{dspReverbFeedback}%</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="80"
                          step="5"
                          value={dspReverbFeedback}
                          onChange={(e) => setDspReverbFeedback(parseInt(e.target.value))}
                          className="w-full h-1 bg-[#1A1C20] rounded appearance-none cursor-pointer accent-amber-400"
                        />
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </section>

          {/* Premium Feature 4: Stereo Ambient Mixer */}
          <section className="bg-[#0F1115] border border-[#2D3036] rounded p-5 shadow-xl relative overflow-hidden space-y-4">
            <div className="absolute top-0 right-0 h-[3px] w-20 bg-blue-400/60" />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Music className="h-4 w-4 text-blue-400" />
                <h2 className="text-[10px] uppercase tracking-widest text-[#5C616A] font-mono font-bold">
                  06 / Sound-Bed Ambient Mixer
                </h2>
              </div>
              <span className="text-[8px] font-mono bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded border border-blue-500/20 font-bold uppercase tracking-widest">
                Ambient Bed
              </span>
            </div>

            <div className="space-y-3.5">
              <label className="text-[10px] text-[#8E9299] font-mono block uppercase tracking-wider">
                Select Procedural Ambient Sound-Bed:
              </label>

              {/* Grid selectors */}
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: "none", label: "None (Pure Dry)", desc: "Isolated narrator voice" },
                  { id: "space", label: "Deep Space", desc: "55Hz breathing sub-drone" },
                  { id: "tape", label: "Analog Tape", desc: "Lo-fi warm hiss & vinyl pops" },
                  { id: "pad", label: "Cosmic Pad", desc: "Lush resonant sweep pads" }
                ].map((track) => (
                  <button
                    key={track.id}
                    type="button"
                    onClick={() => setAmbientTrack(track.id)}
                    className={`p-2.5 rounded-lg border text-left flex flex-col justify-between gap-1 transition-all group cursor-pointer ${
                      ambientTrack === track.id
                        ? "bg-blue-500/10 border-blue-400/50 text-blue-400 shadow-md"
                        : "bg-[#0B0C0E] border-[#2D3036] hover:border-[#5C616A] text-[#8E9299]"
                    }`}
                  >
                    <span className={`text-[10.5px] font-mono font-bold group-hover:text-slate-200 transition-colors ${
                      ambientTrack === track.id ? "text-blue-400 font-black" : "text-slate-300"
                    }`}>
                      {track.label}
                    </span>
                    <span className="text-[8.5px] font-mono leading-tight text-[#5C616A] group-hover:text-[#8E9299]">
                      {track.desc}
                    </span>
                  </button>
                ))}
              </div>

              {/* Sound-bed Mix volume */}
              {ambientTrack !== "none" && (
                <div className="bg-[#0B0C0E] border border-[#2D3036]/60 rounded p-3 space-y-2">
                  <div className="flex items-center justify-between text-[9.5px] font-mono text-[#8E9299]">
                    <span>Background Sound-Bed Volume Mix:</span>
                    <span className="text-blue-400 font-bold">{ambientVolume}%</span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="80"
                    step="5"
                    value={ambientVolume}
                    onChange={(e) => setAmbientVolume(parseInt(e.target.value))}
                    className="w-full h-1 bg-[#1A1C20] rounded-lg appearance-none cursor-pointer accent-blue-400"
                  />
                  <p className="text-[8px] text-[#5C616A] font-mono text-center italic">
                    Mixed dynamically in-browser under the narration track. Adjust to blend.
                  </p>

                  {/* Dynamic Speech Auto-Ducking Toggle and Indicator */}
                  <div className="bg-[#0B0C0E]/50 border border-[#2D3036]/40 rounded p-2.5 space-y-2 font-mono mt-1">
                    <div className="flex items-center justify-between text-[9px]">
                      <span className="text-[#8E9299] font-bold uppercase tracking-wider flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${autoDuckingEnabled && isPlaying ? "bg-blue-400 animate-pulse" : "bg-zinc-600"}`} />
                        Speech Auto-Ducking
                      </span>
                      <button
                        type="button"
                        onClick={() => setAutoDuckingEnabled(!autoDuckingEnabled)}
                        className={`px-2 py-0.5 rounded text-[8px] font-bold tracking-wider uppercase border transition-all cursor-pointer ${
                          autoDuckingEnabled
                            ? "bg-blue-500/10 border-blue-400/40 text-blue-400"
                            : "bg-[#14161B] border-[#2D3036] text-[#5C616A] hover:border-[#8E9299]/50"
                        }`}
                        id="toggle-auto-ducking"
                      >
                        {autoDuckingEnabled ? "ENABLED" : "DISABLED"}
                      </button>
                    </div>
                    <p className="text-[8px] text-[#5C616A] leading-relaxed">
                      Automatically reduces background soundscapes by 75% when the narration speaks, smoothly restoring full volume during natural pauses or silences.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </section>

        </div>

        {/* Right Side: Script console and interactive player (Col-span 7) */}
        <div className="lg:col-span-7 space-y-6">

          {/* Core Panel: Interactive Text Script Console / Bulk Script Manager */}
          <section className="bg-[#0F1115] border border-[#2D3036] rounded p-5 shadow-xl flex flex-col min-h-[320px] relative overflow-hidden">
            <div className="absolute top-0 right-0 h-[3px] w-16 bg-[#4ADE80]" />
            
            {/* Tab switchers */}
            <div className="flex border-b border-[#2D3036] mb-5 font-mono text-[10px] uppercase tracking-widest">
              <button
                onClick={() => setScriptConsoleTab("single")}
                className={`pb-3 px-4 font-bold cursor-pointer transition-all border-b-2 -mb-[2px] ${
                  scriptConsoleTab === "single"
                    ? "border-[#4ADE80] text-[#4ADE80]"
                    : "border-transparent text-[#5C616A] hover:text-[#8E9299]"
                }`}
                id="btn-tab-single"
              >
                [03A] Single Voiceover
              </button>
              <button
                onClick={() => setScriptConsoleTab("bulk")}
                className={`pb-3 px-4 font-bold cursor-pointer transition-all border-b-2 -mb-[2px] flex items-center gap-1.5 ${
                  scriptConsoleTab === "bulk"
                    ? "border-[#4ADE80] text-[#4ADE80]"
                    : "border-transparent text-[#5C616A] hover:text-[#8E9299]"
                }`}
                id="btn-tab-bulk"
              >
                <Plus className="h-3.5 w-3.5" />
                [03B] Bulk Batch Manager
              </button>
            </div>

            {scriptConsoleTab === "single" ? (
              <>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Sliders className="h-4 w-4 text-[#4ADE80]" />
                    <h2 className="text-[10px] uppercase tracking-widest text-[#5C616A] font-mono font-bold">
                      03 / Single Script Console
                    </h2>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setAutoSaveText(!autoSaveText)}
                      className={`text-[9px] font-mono uppercase tracking-wider flex items-center gap-1.5 px-2 py-0.5 rounded border transition-all cursor-pointer ${
                        autoSaveText
                          ? "text-[#4ADE80] bg-[#4ADE80]/10 border-[#4ADE80]/30 hover:bg-[#4ADE80]/20"
                          : "text-[#8E9299] bg-[#15171C] border-[#2D3036] hover:bg-[#1C1F26]"
                      }`}
                      title={autoSaveText ? "Click to pause auto-saving of script text to localStorage" : "Click to enable auto-saving of script text to localStorage"}
                      id="btn-toggle-autosave"
                    >
                      <span className={`h-1.5 w-1.5 rounded-full transition-all ${autoSaveText ? "bg-[#4ADE80] animate-pulse" : "bg-[#8E9299]"}`} />
                      <span>{autoSaveText ? "Auto-Save: On" : "Auto-Save: Off"}</span>
                    </button>
                    {text.length > 0 && (
                      <button 
                        onClick={() => setText("")}
                        className="text-[9px] text-[#FF4444] hover:text-[#EF4444] hover:underline font-mono uppercase tracking-wider flex items-center gap-1 transition-all"
                        title="Clear current script text (destructive action)"
                        id="btn-clear-script"
                      >
                        [Clear Script]
                      </button>
                    )}
                    <span className="text-[10px] text-[#8E9299] font-mono uppercase">
                      {text.length} characters
                    </span>
                  </div>
                </div>

                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  className="w-full flex-grow bg-[#0B0C0E] border border-[#2D3036] rounded p-3.5 text-sm text-[#D1D5DB] font-sans focus:outline-none focus:border-[#4ADE80]/40 transition-colors leading-relaxed resize-y"
                  placeholder="Paste voiceover text here..."
                  rows={8}
                  id="script-input-textarea"
                />

                {/* Trim Silence Console Utility */}
                <div className="mt-4 border-t border-[#2D3036]/60 pt-3 flex flex-col gap-1 select-none">
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => setTrimSilence(!trimSilence)}
                      className="flex items-center gap-2 text-xs font-mono cursor-pointer text-left"
                      id="btn-trim-silence-toggle"
                      title="Detect and trim silence from the audio signal"
                    >
                      <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center border transition-all ${
                        trimSilence 
                          ? "bg-[#4ADE80] border-[#4ADE80] shadow-[0_0_8px_rgba(74,222,128,0.6)]" 
                          : "bg-transparent border-[#2D3036]"
                      }`}>
                        {trimSilence && (
                          <div className="w-1.5 h-1.5 bg-white rounded-full" />
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Scissors className={`h-3.5 w-3.5 ${trimSilence ? "text-[#4ADE80]" : "text-[#5C616A]"}`} />
                        <span className={`text-[9px] font-bold tracking-wider uppercase ${trimSilence ? "text-[#4ADE80]" : "text-[#8E9299]"}`}>
                          AUTO-TRIM SILENCE (NOISE GATE)
                        </span>
                      </div>
                    </button>
                    {base64Audio && silenceReport && trimSilence && (
                      <span className="text-[9.5px] font-mono text-[#4ADE80] bg-[#4ADE80]/10 border border-[#4ADE80]/20 px-2 py-0.5 rounded">
                        Trimmed: -{Math.round(silenceReport.leadingMs)}ms (start) / -{Math.round(silenceReport.trailingMs)}ms (end)
                      </span>
                    )}
                  </div>
                  <p className="text-[8.5px] font-mono text-[#5C616A] italic">
                    Automatically crops ambient leading/trailing audio below -40dB (300 PCM amplitude) for instantaneous starting response.
                  </p>
                </div>
                
                {/* Generate Trigger Button (Sophisticated Dark custom action look) */}
                <div className="mt-4 flex items-center justify-end gap-3 border-t border-[#2D3036] pt-4">
                  <button
                    onClick={handleGenerate}
                    disabled={isGenerating || !text.trim()}
                    className={`w-full py-3.5 px-6 rounded text-xs font-mono font-bold tracking-widest uppercase transition-all flex items-center justify-center gap-2 border shadow-lg ${
                      isGenerating 
                        ? "bg-[#15171C] border-[#2D3036] text-[#5C616A] cursor-not-allowed" 
                        : "bg-[#4ADE80] hover:bg-[#22C55E] border-none text-[#0B0C0E] hover:scale-[1.01] hover:shadow-[0_0_15px_rgba(74,222,128,0.4)] active:scale-[0.99] cursor-pointer"
                    }`}
                    id="btn-generate-voiceover"
                  >
                    {isGenerating ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin animate-duration-1000" />
                        <span>
                          {isComparisonMode 
                            ? (generationStage === "voiceA" 
                                ? `Queue Step 1/2: Synthesizing ${comparisonVoiceA}...` 
                                : `Queue Step 2/2: Synthesizing ${comparisonVoiceB}...`)
                            : "Synthesizing Studio Recording Signal..."
                          }
                        </span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4" />
                        <span>
                          {isComparisonMode 
                            ? `CONSECUTIVE GENERATION (${comparisonVoiceA} vs ${comparisonVoiceB})` 
                            : "GENERATE DRY VOICE RECORDING"
                          }
                        </span>
                      </>
                    )}
                  </button>
                </div>

                {/* [03C] Vocal Pacing & Script Sync (Premium Analysis System) */}
                <div className="mt-5 border-t border-[#2D3036] pt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Timer className="h-4 w-4 text-[#4ADE80]" />
                      <span className="text-[10px] uppercase tracking-widest text-[#8E9299] font-mono font-bold">
                        03C / Vocal Pacing & Sync Analyzer
                      </span>
                    </div>
                    {isSynced && (
                      <button
                        onClick={() => {
                          setIsSynced(false);
                          setSyncSegments([]);
                        }}
                        className="text-[9px] text-[#FF4444] hover:underline font-mono uppercase cursor-pointer"
                        id="btn-reset-sync"
                      >
                        [Reset Sync]
                      </button>
                    )}
                  </div>

                  <p className="text-[9px] font-mono text-[#5C616A] leading-relaxed">
                    Estimates words-per-minute (WPM) speed by analyzing natural audio transient levels. Highlight parts of the script reading significantly faster or slower than the average.
                  </p>

                  {/* WPM Target Threshold Config */}
                  <div className="bg-[#0B0C0E]/50 border border-[#2D3036]/40 rounded p-2.5 space-y-2 font-mono">
                    <div className="flex items-center justify-between text-[9.5px]">
                      <span className="text-[#8E9299] font-bold uppercase tracking-wider">Target WPM Threshold:</span>
                      <span className="text-white font-bold">{targetWpm} <span className="text-[8px] font-normal text-[#5C616A]">WPM</span></span>
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min="80"
                        max="240"
                        step="5"
                        value={targetWpm}
                        onChange={(e) => handleTargetWpmChange(parseInt(e.target.value))}
                        className="flex-1 h-1 bg-[#1A1C20] rounded-lg appearance-none cursor-pointer accent-emerald-400"
                        id="slider-target-wpm"
                      />
                      <input
                        type="number"
                        min="1"
                        max="500"
                        value={targetWpm}
                        onChange={(e) => handleTargetWpmChange(parseInt(e.target.value) || 150)}
                        className="w-14 bg-[#14161B] border border-[#2D3036] text-[10px] text-center text-white py-0.5 rounded font-bold"
                        id="input-target-wpm"
                      />
                    </div>
                  </div>

                  {!isSynced ? (
                    <button
                      onClick={handleSyncScript}
                      disabled={!base64Audio || isGenerating || !text.trim()}
                      className={`w-full py-3 px-4 rounded text-[10px] font-mono font-bold tracking-wider uppercase border transition-all flex items-center justify-center gap-2 cursor-pointer ${
                        !base64Audio || isGenerating || !text.trim()
                          ? "bg-[#15171C] border-[#2D3036] text-[#5C616A] cursor-not-allowed"
                          : "bg-[#0B0C0E] border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500/60 shadow-[0_0_10px_rgba(74,222,128,0.05)]"
                      }`}
                      id="btn-sync-script-pace"
                    >
                      <RefreshCw className={`h-3 w-3 ${isGenerating ? "animate-spin" : ""}`} />
                      <span>{!base64Audio ? "GENERATE VOICE TO ENABLE PACE SYNC" : "RUN SYNC & PACING ANALYSIS"}</span>
                    </button>
                  ) : (
                    <div className="space-y-4 font-mono">
                      {/* Sync Metrics Header */}
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className={`p-3 rounded border transition-all ${
                          averageWpm > targetWpm
                            ? "bg-rose-950/20 border-rose-500/40 text-rose-400 shadow-[0_0_10px_rgba(244,63,94,0.1)]"
                            : "bg-[#0B0C0E] border-[#2D3036]/60 text-white"
                        }`}>
                          <span className="text-[8px] text-[#5C616A] uppercase tracking-wider block font-bold">Average Pace</span>
                          <span className={`text-xs font-bold block ${averageWpm > targetWpm ? "text-rose-400" : "text-white"}`}>
                            {Math.round(averageWpm)} <span className="text-[9px] font-normal text-[#8E9299]">WPM</span>
                          </span>
                        </div>
                        <div className={`p-3 rounded border transition-all border-x ${
                          averageWpm > targetWpm
                            ? "bg-rose-950/10 border-[#2D3036]/60 text-rose-400"
                            : "bg-[#0B0C0E] border-[#2D3036]/60 text-white"
                        }`}>
                          <span className="text-[8px] text-[#5C616A] uppercase tracking-wider block font-bold">Pace Category</span>
                          <span className={`text-[10px] font-bold block uppercase ${
                            averageWpm > targetWpm 
                              ? "text-rose-500 animate-pulse font-extrabold"
                              : averageWpm > 165 
                                ? "text-amber-400" 
                                : averageWpm < 120 
                                  ? "text-blue-400" 
                                  : "text-[#4ADE80]"
                          }`}>
                            {averageWpm > targetWpm ? "EXCEEDS TARGET" : averageWpm > 165 ? "Fast Pace" : averageWpm < 120 ? "Slow Pace" : "Optimal"}
                          </span>
                        </div>
                        <div className="bg-[#0B0C0E] p-3 rounded border border-[#2D3036]/60 text-center">
                          <span className="text-[8px] text-[#5C616A] uppercase tracking-wider block font-bold">Phrases</span>
                          <span className="text-xs font-bold text-slate-300 block">{syncSegments.length}</span>
                        </div>
                      </div>

                      {averageWpm > targetWpm && (
                        <div className="bg-rose-500/10 border border-rose-500/30 p-2.5 rounded text-[10px] text-rose-400 flex items-center gap-2">
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
                          <span>Pacing warning: Speed ({Math.round(averageWpm)} WPM) exceeds your target limit of {targetWpm} WPM.</span>
                        </div>
                      )}

                      {/* Interactive Scannable Script Blocks */}
                      <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1">
                        {syncSegments.map((seg, idx) => {
                          const isCurrent = currentTime >= seg.startTime && currentTime <= seg.endTime;
                          return (
                            <button
                              key={idx}
                              onClick={() => handleSeekToTime(seg.startTime)}
                              className={`w-full text-left p-2.5 rounded border transition-all text-xs flex flex-col gap-1.5 cursor-pointer select-none group relative ${
                                isCurrent
                                  ? "bg-emerald-500/10 border-emerald-500/50 shadow-md"
                                  : "bg-[#0B0C0E]/60 border-[#2D3036]/40 hover:bg-[#0B0C0E] hover:border-[#2D3036]"
                              }`}
                            >
                              <div className="flex items-center justify-between text-[9px] font-mono">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[#5C616A] font-bold">#{String(idx + 1).padStart(2, "0")}</span>
                                  <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider ${
                                    seg.status === "fast"
                                      ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                                      : seg.status === "slow"
                                        ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                                        : "bg-emerald-500/10 text-[#4ADE80] border border-emerald-500/20"
                                  }`}>
                                    {seg.status === "fast"
                                      ? `${Math.abs(seg.deviation)}% FAST (${Math.round(seg.wpm)} WPM)`
                                      : seg.status === "slow"
                                        ? `${Math.abs(seg.deviation)}% SLOW (${Math.round(seg.wpm)} WPM)`
                                        : `OPTIMAL (${Math.round(seg.wpm)} WPM)`
                                    }
                                  </span>
                                </div>
                                <span className={`text-[8.5px] font-mono group-hover:text-emerald-400 transition-colors ${
                                  isCurrent ? "text-emerald-400 font-bold animate-pulse" : "text-[#5C616A]"
                                }`}>
                                  {formatSyncTime(seg.startTime)} - {formatSyncTime(seg.endTime)} ({seg.duration.toFixed(1)}s)
                                </span>
                              </div>
                              <p className={`text-[11.5px] font-sans leading-relaxed transition-colors ${
                                isCurrent ? "text-white font-medium" : "text-slate-300"
                              }`}>
                                {seg.text}
                              </p>
                              {/* Background play/seek helper indicator on hover */}
                              <div className="absolute right-2.5 bottom-1.5 opacity-0 group-hover:opacity-100 transition-opacity text-[8px] font-mono text-emerald-400 tracking-widest font-bold">
                                ➔ CLICK TO SEEK
                              </div>
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-[8px] text-[#5C616A] text-center italic">
                        Click on any segment to instantly seek playback and trace the voice recording pace live.
                      </p>
                    </div>
                  )}
                </div>
              </>
            ) : (
              // Bulk Batch Script Manager UI
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-[#0B0C0E]/80 p-3.5 rounded border border-[#2D3036]/80 font-mono">
                  <div className="space-y-1">
                    <span className="text-[10px] text-[#4ADE80] font-mono uppercase tracking-wider block font-bold">
                      Format Specification
                    </span>
                    <span className="text-[9px] text-[#8E9299] font-mono block">
                      Choose input layout parsing rules
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      onClick={() => {
                        setBulkFormat("lines");
                        handleParseBulkScripts(bulkInputText, "lines", true);
                      }}
                      className={`text-[9.5px] px-3 py-1.5 rounded font-mono font-bold cursor-pointer uppercase border transition-all ${
                        bulkFormat === "lines"
                          ? "bg-[#4ADE80]/15 border-[#4ADE80] text-[#4ADE80]"
                          : "bg-[#15171C] border-[#2D3036] text-[#8E9299] hover:text-white"
                      }`}
                    >
                      Line-By-Line
                    </button>
                    <button
                      onClick={() => {
                        setBulkFormat("csv");
                        handleParseBulkScripts(bulkInputText, "csv", true);
                      }}
                      className={`text-[9.5px] px-3 py-1.5 rounded font-mono font-bold cursor-pointer uppercase border transition-all ${
                        bulkFormat === "csv"
                          ? "bg-[#4ADE80]/15 border-[#4ADE80] text-[#4ADE80]"
                          : "bg-[#15171C] border-[#2D3036] text-[#8E9299] hover:text-white"
                      }`}
                    >
                      CSV Format
                    </button>
                  </div>
                </div>

                {/* Templates and upload presets */}
                <div className="flex items-center justify-between flex-wrap gap-2 text-[10px] font-mono">
                  <span className="text-[#5C616A] uppercase font-bold tracking-wider">Template Presets:</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        const t = `Target acquired. Locking active acoustic channels.\nRunning terminal diagnostic sequence.\nSignal chain calibrated to baseline standards.`;
                        setBulkInputText(t);
                        handleParseBulkScripts(t, "lines", true);
                        setBulkFormat("lines");
                      }}
                      className="text-[9px] bg-[#15171C] hover:bg-[#1C1F26] text-white border border-[#2D3036] px-2 py-1 rounded transition-colors uppercase"
                    >
                      Load Lines Template
                    </button>
                    <button
                      onClick={() => {
                        const t = `Text,Voice,Tone\n"System initialized. Core operational.",Charon,"low pitch, deep resonant cinematic voice"\n"Warning: Transient signal anomaly detected.",Fenrir,"urgent, commanding dry baritone broadcast"\n"Acoustic frequency scan completed.",Zephyr,"neutral tone, slow paced, technical readout"`;
                        setBulkInputText(t);
                        handleParseBulkScripts(t, "csv", true);
                        setBulkFormat("csv");
                      }}
                      className="text-[9px] bg-[#15171C] hover:bg-[#1C1F26] text-white border border-[#2D3036] px-2 py-1 rounded transition-colors uppercase"
                    >
                      Load CSV Template
                    </button>
                  </div>
                </div>

                {/* Drag-and-drop text container */}
                <div 
                  onDragOver={(e) => {
                    e.preventDefault();
                    setBulkIsDragging(true);
                  }}
                  onDragLeave={() => setBulkIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setBulkIsDragging(false);
                    const files = e.dataTransfer.files;
                    if (files && files.length > 0) {
                      handleBulkFileLoad(files[0]);
                    }
                  }}
                  className={`border border-dashed rounded-lg p-3 transition-all ${
                    bulkIsDragging 
                      ? "border-[#4ADE80] bg-[#4ADE80]/5" 
                      : "border-[#2D3036] bg-[#0B0C0E]/40"
                  }`}
                >
                  <div className="flex flex-col gap-2">
                    <textarea
                      value={bulkInputText}
                      onChange={(e) => {
                        setBulkInputText(e.target.value);
                        handleParseBulkScripts(e.target.value, bulkFormat);
                      }}
                      className="w-full bg-[#0B0C0E] border border-[#2D3036]/60 rounded p-3 text-xs text-[#D1D5DB] font-mono focus:outline-none focus:border-[#4ADE80]/30 leading-relaxed resize-y h-36"
                      placeholder={
                        bulkFormat === "lines"
                          ? "Enter scripts, one script per line..."
                          : "Text,Voice,Tone\n\"Line 1...\",Charon,\"deep tone\"\n\"Line 2...\",Fenrir,\"low pitch\""
                      }
                    />

                    <div className="flex items-center justify-between flex-wrap gap-2 pt-1 font-mono">
                      <label className="flex items-center gap-1.5 text-[10px] text-[#8E9299] hover:text-white font-mono cursor-pointer uppercase transition-colors">
                        <Upload className="h-3.5 w-3.5 text-[#4ADE80]" />
                        <span>Upload CSV / TXT Script</span>
                        <input
                          type="file"
                          accept=".csv,.txt"
                          className="hidden"
                          onChange={(e) => {
                            const files = e.target.files;
                            if (files && files.length > 0) {
                              handleBulkFileLoad(files[0]);
                            }
                          }}
                        />
                      </label>

                      <div className="flex items-center gap-2">
                        {bulkUploadError && (
                          <span className="text-[9.5px] text-[#FF4444] font-mono uppercase">
                            {bulkUploadError}
                          </span>
                        )}
                        <button
                          onClick={() => handleParseBulkScripts(bulkInputText, bulkFormat, true)}
                          className="text-[10px] bg-[#4ADE80]/10 hover:bg-[#4ADE80]/20 text-[#4ADE80] border border-[#4ADE80]/30 font-mono uppercase px-2.5 py-1 rounded transition-colors cursor-pointer"
                        >
                          Reparse Queue
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Queue Inspector */}
                <div className="border border-[#2D3036] rounded bg-[#0B0C0E]/40 overflow-hidden font-mono">
                  <div className="bg-[#0B0C0E] px-3.5 py-2 flex items-center justify-between border-b border-[#2D3036]">
                    <span className="text-[10px] font-mono font-bold uppercase text-[#8E9299]">
                      Batch Queue Inspector
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setShowBulkTimelinePreview(!showBulkTimelinePreview)}
                        disabled={bulkItems.length === 0}
                        className={`flex items-center gap-1.5 text-[9px] font-mono px-2 py-0.5 rounded cursor-pointer transition-all uppercase font-bold border ${
                          bulkItems.length === 0
                            ? "bg-[#15171C] border-[#2D3036] text-[#5C616A] cursor-not-allowed"
                            : showBulkTimelinePreview
                              ? "bg-[#4ADE80]/15 border-[#4ADE80] text-[#4ADE80]"
                              : "bg-[#15171C] border-[#2D3036] text-[#8E9299] hover:text-white"
                        }`}
                        title="Toggle split-pane interactive script preview & timeline visualization"
                        id="btn-toggle-bulk-timeline"
                      >
                        <Eye className="h-3 w-3" />
                        <span>{showBulkTimelinePreview ? "Show Queue" : "Preview Script"}</span>
                      </button>

                      {bulkUndoStack.length > 0 && (
                        <button
                          onClick={handleUndoBulkAction}
                          className="flex items-center gap-1.5 text-[9px] font-mono text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 hover:border-blue-500/40 px-2 py-0.5 rounded cursor-pointer transition-all uppercase font-bold"
                          title="Undo the last batch operation (accidental deletion, reset or script change)"
                          id="btn-undo-bulk"
                        >
                          <Undo2 className="h-3 w-3" />
                          <span>Undo ({bulkUndoStack.length})</span>
                        </button>
                      )}
                      <span className="text-[10px] font-mono text-[#4ADE80] bg-[#4ADE80]/10 border border-[#4ADE80]/20 px-2 py-0.5 rounded">
                        {bulkItems.length} scripts parsed
                      </span>
                    </div>
                  </div>

                  {(() => {
                    const completedDuration = bulkItems.filter(i => i.status === "completed").reduce((sum, i) => sum + (i.duration || 0), 0);
                    const remainingDuration = bulkItems.filter(i => i.status !== "completed").reduce((sum, i) => {
                      const words = i.text ? i.text.split(/\s+/).filter(Boolean).length : 0;
                      return sum + Math.max(1.0, words * 0.45);
                    }, 0);
                    const totalDuration = completedDuration + remainingDuration;
                    const completedCount = bulkItems.filter(i => i.status === "completed").length;

                    if (bulkItems.length === 0) return null;

                    return (
                      <>
                        {/* Visual Summary Header */}
                        <div className="bg-[#0D0F12] px-3.5 py-3 border-b border-[#2D3036] grid grid-cols-3 gap-2 text-center text-[10px] font-mono">
                          <div className="bg-[#15171C] p-2 rounded border border-[#2D3036]/60 flex flex-col justify-center">
                            <span className="text-[#8E9299] text-[8px] uppercase tracking-wider block mb-0.5">Total Duration</span>
                            <span className="text-white text-xs font-bold font-mono tracking-tight text-[#4ADE80]">
                              {totalDuration.toFixed(1)}s
                            </span>
                          </div>
                          <div className="bg-[#15171C] p-2 rounded border border-[#2D3036]/60 flex flex-col justify-center">
                            <span className="text-[#8E9299] text-[8px] uppercase tracking-wider block mb-0.5">Completed WAV</span>
                            <span className="text-emerald-400 text-xs font-bold font-mono tracking-tight">
                              {completedDuration.toFixed(1)}s
                            </span>
                          </div>
                          <div className="bg-[#15171C] p-2 rounded border border-[#2D3036]/60 flex flex-col justify-center">
                            <span className="text-[#8E9299] text-[8px] uppercase tracking-wider block mb-0.5">Pending (Est)</span>
                            <span className="text-yellow-500/90 text-xs font-bold font-mono tracking-tight">
                              {remainingDuration.toFixed(1)}s
                            </span>
                          </div>
                        </div>

                        {/* Visual Progress Bar */}
                        <div className="bg-[#0B0C0E]/50 px-3.5 py-1.5 border-b border-[#2D3036] flex items-center justify-between text-[9px] font-mono">
                          <div className="flex items-center gap-1">
                            <span className="text-[#5C616A] uppercase font-bold">Progress:</span>
                            <span className="text-white">
                              {completedCount} / {bulkItems.length} Complete
                            </span>
                          </div>
                          <div className="w-1/2 bg-[#15171C] h-1.5 rounded-full overflow-hidden border border-[#2D3036]/60">
                            <div 
                              className="bg-[#4ADE80] h-full transition-all duration-300" 
                              style={{ width: `${(completedCount / bulkItems.length) * 100}%` }}
                            />
                          </div>
                        </div>

                        {/* Filter Segmented Control */}
                        <div className="bg-[#0D0F12] px-3.5 py-2 border-b border-[#2D3036] flex flex-wrap items-center justify-between gap-2 text-[9.5px] font-mono select-none">
                          <span className="text-[#8E9299] uppercase font-bold text-[8.5px] tracking-wider">Filter Queue:</span>
                          <div className="flex flex-wrap items-center gap-1">
                            {[
                              { label: "All", value: "all", count: bulkItems.length, color: "text-[#8E9299] bg-[#8E9299]/10" },
                              { label: "Idle", value: "idle", count: bulkItems.filter(i => i.status === "idle").length, color: "text-[#5C616A] bg-[#5C616A]/10" },
                              { label: "Active", value: "generating", count: bulkItems.filter(i => i.status === "generating").length, color: "text-[#4ADE80] bg-[#4ADE80]/10" },
                              { label: "Completed", value: "completed", count: bulkItems.filter(i => i.status === "completed").length, color: "text-emerald-400 bg-emerald-500/10" },
                              { label: "Failed", value: "failed", count: bulkItems.filter(i => i.status === "failed").length, color: "text-[#FF4444] bg-[#FF4444]/10" }
                            ].map(tab => {
                              const isActive = bulkFilter === tab.value;
                              return (
                                <button
                                  key={tab.value}
                                  onClick={() => setBulkFilter(tab.value as any)}
                                  className={`px-2 py-1 rounded text-[9px] font-bold uppercase transition-all cursor-pointer border ${
                                    isActive
                                      ? "bg-[#1C1F26] border-[#4ADE80]/30 text-white shadow-[0_0_8px_rgba(74,222,128,0.1)]"
                                      : "bg-transparent border-transparent text-[#5C616A] hover:text-[#8E9299] hover:bg-[#15171C]/50"
                                  }`}
                                  id={`btn-filter-bulk-${tab.value}`}
                                >
                                  <span>{tab.label}</span>
                                  <span className={`ml-1.5 px-1 py-0.2 rounded text-[8px] font-mono border border-[#2D3036]/50 ${tab.color}`}>
                                    {tab.count}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </>
                    );
                  })()}

                  {showBulkTimelinePreview ? (
                    <div className="grid grid-cols-1 md:grid-cols-12 border-t border-[#2D3036]/60 bg-[#0C0E12] text-xs font-mono select-none" style={{ height: "350px" }}>
                      {/* Left Pane: Segment Texts List */}
                      <div className="md:col-span-5 flex flex-col border-r border-[#2D3036]/60 h-full overflow-hidden">
                        <div className="bg-[#121419] px-3 py-2 border-b border-[#2D3036]/60 text-[9px] font-bold text-[#8E9299] uppercase tracking-wider flex justify-between items-center bg-[#0B0C0E]">
                          <span>Segment Text Details</span>
                          <span className="text-[8px] text-[#5C616A] lowercase italic">Hover segment to sync</span>
                        </div>
                        <div className="flex-grow overflow-y-auto divide-y divide-[#2D3036]/40 max-h-[315px]">
                          {(() => {
                            let cumulative = 0;
                            return bulkItems.map((item, idx) => {
                              const words = item.text ? item.text.split(/\s+/).filter(Boolean).length : 0;
                              const estDur = Math.max(1.0, words * 0.45);
                              const duration = item.status === "completed" && item.duration ? item.duration : estDur;
                              const start = cumulative;
                              const end = cumulative + duration;
                              cumulative = end;

                              const isHovered = hoveredSegmentIndex === idx;
                              const isCompleted = item.status === "completed";
                              const isGenerating = item.status === "generating";
                              const isFailed = item.status === "failed";

                              return (
                                <div
                                  key={item.id}
                                  onMouseEnter={() => setHoveredSegmentIndex(idx)}
                                  onMouseLeave={() => setHoveredSegmentIndex(null)}
                                  className={`p-3 transition-colors text-left relative group ${
                                    isHovered ? "bg-[#1F2937]/35" : "hover:bg-[#15171C]/40"
                                  }`}
                                >
                                  <div className="flex items-center justify-between mb-1">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      <span className={`text-[9.5px] font-bold ${isHovered ? "text-[#4ADE80]" : "text-[#5C616A]"}`}>
                                        [{String(idx + 1).padStart(2, "0")}]
                                      </span>
                                      <span className="text-[9.5px] text-white font-medium truncate max-w-[75px]" title={`Voice: ${item.voiceName}`}>
                                        {item.voiceName}
                                      </span>
                                      <span className="text-[8px] text-[#5C616A] truncate max-w-xs" title={`Tone: ${item.toneDescription}`}>
                                        {item.toneDescription}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                      {isCompleted && (
                                        <span className="text-[8px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1 py-0.2 rounded font-bold">
                                          {duration.toFixed(1)}s
                                        </span>
                                      )}
                                      {isGenerating && (
                                        <span className="text-[8px] text-amber-500 bg-amber-500/10 border border-amber-500/20 px-1 py-0.2 rounded animate-pulse font-bold max-w-[95px] truncate" title={item.progressText || "Generating..."}>
                                          {item.progressText || "Gen..."}
                                        </span>
                                      )}
                                      {isFailed && (
                                        <span className="text-[8px] text-red-500 bg-red-500/10 border border-red-500/20 px-1 py-0.2 rounded font-bold max-w-[95px] truncate" title={item.error || "Failed"}>
                                          {item.progressText || "Err"}
                                        </span>
                                      )}
                                      {item.status === "idle" && (
                                        <span className="text-[8px] text-[#5C616A] bg-[#2D3036]/30 border border-[#2D3036]/50 px-1 py-0.2 rounded">
                                          {duration.toFixed(1)}s (est)
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <p className={`text-[10px] font-sans leading-relaxed line-clamp-2 transition-colors ${
                                    isHovered ? "text-white" : "text-slate-400 group-hover:text-slate-300"
                                  }`}>
                                    {item.text}
                                  </p>
                                  <div className="mt-1.5 flex items-center justify-between">
                                    <span className="text-[8px] text-[#5C616A]">
                                      Span: {start.toFixed(1)}s - {end.toFixed(1)}s
                                    </span>
                                    {isCompleted && item.audioBuffer && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handlePlayBulkItem(item);
                                        }}
                                        className="text-[8px] text-[#4ADE80] hover:text-[#22C55E] flex items-center gap-0.5 bg-[#4ADE80]/10 hover:bg-[#4ADE80]/20 border border-[#4ADE80]/20 px-1 py-0.2 rounded cursor-pointer transition-colors"
                                      >
                                        <Play className="h-2 w-2 fill-current" />
                                        Play
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            });
                          })()}
                        </div>
                      </div>

                      {/* Right Pane: Chronological Timeline Visualization */}
                      <div className="md:col-span-7 flex flex-col h-full overflow-hidden bg-[#08090C]">
                        <div className="bg-[#121419] px-3 py-2 border-b border-[#2D3036]/60 text-[9px] font-bold text-[#8E9299] uppercase tracking-wider flex justify-between items-center bg-[#0B0C0E]">
                          <span>Chronological Track Timeline</span>
                          <span className="text-[#4ADE80] font-bold">
                            {(() => {
                              let cumulative = 0;
                              bulkItems.forEach(item => {
                                const words = item.text ? item.text.split(/\s+/).filter(Boolean).length : 0;
                                const estDur = Math.max(1.0, words * 0.45);
                                const duration = item.status === "completed" && item.duration ? item.duration : estDur;
                                cumulative += duration;
                              });
                              return `${cumulative.toFixed(1)}s Total`;
                            })()}
                          </span>
                        </div>

                        {/* Visual Timeline Ruler and Channels */}
                        <div className="flex-grow flex flex-col overflow-hidden p-3 space-y-3">
                          {(() => {
                            let cumulative = 0;
                            const timelineSegments = bulkItems.map((item, idx) => {
                              const words = item.text ? item.text.split(/\s+/).filter(Boolean).length : 0;
                              const estDur = Math.max(1.0, words * 0.45);
                              const duration = item.status === "completed" && item.duration ? item.duration : estDur;
                              const startTime = cumulative;
                              const endTime = cumulative + duration;
                              cumulative = endTime;
                              return { startTime, endTime, duration };
                            });
                            const totalDuration = cumulative || 1;

                            // Dynamic timeline ruler ticks (every 5s, 10s or 20s)
                            const tickInterval = totalDuration > 100 ? 20 : totalDuration > 40 ? 10 : 5;
                            const ticksCount = Math.ceil(totalDuration / tickInterval) + 1;
                            const ticks = Array.from({ length: ticksCount }).map((_, i) => i * tickInterval);

                            return (
                              <div className="flex-grow flex flex-col justify-between overflow-hidden select-none space-y-2">
                                {/* Time Ruler */}
                                <div className="relative h-5 border-b border-[#2D3036]/40 text-[7.5px] text-[#5C616A] font-mono shrink-0">
                                  {ticks.map(tick => {
                                    const leftPercent = (tick / totalDuration) * 100;
                                    if (leftPercent > 100) return null;
                                    return (
                                      <div
                                        key={tick}
                                        className="absolute transform -translate-x-1/2 flex flex-col items-center h-full justify-between"
                                        style={{ left: `${leftPercent}%` }}
                                      >
                                        <span>{tick}s</span>
                                        <div className="w-[1px] h-1.5 bg-[#2D3036]" />
                                      </div>
                                    );
                                  })}
                                </div>

                                {/* Stacked Rows */}
                                <div className="flex-grow space-y-1.5 overflow-y-auto pr-1 max-h-[195px]">
                                  {bulkItems.map((item, idx) => {
                                    const seg = timelineSegments[idx];
                                    if (!seg) return null;
                                    const isHovered = hoveredSegmentIndex === idx;
                                    const isCompleted = item.status === "completed";
                                    const isGenerating = item.status === "generating";
                                    const isFailed = item.status === "failed";

                                    const startPct = (seg.startTime / totalDuration) * 100;
                                    const widthPct = (seg.duration / totalDuration) * 100;

                                    return (
                                      <div
                                        key={item.id}
                                        onMouseEnter={() => setHoveredSegmentIndex(idx)}
                                        onMouseLeave={() => setHoveredSegmentIndex(null)}
                                        className={`relative h-6 flex items-center transition-all bg-[#121419]/20 rounded border ${
                                          isHovered ? "border-[#2D3036] bg-[#1F2937]/10" : "border-transparent"
                                        }`}
                                      >
                                        {/* Guide line across timeline row */}
                                        <div className="absolute left-0 right-0 h-[1px] bg-[#1F2937]/10 pointer-events-none" />

                                        {/* Segment Block */}
                                        <div
                                          className={`absolute h-4.5 rounded flex items-center px-1 text-[8px] font-bold select-none cursor-pointer overflow-hidden transition-all duration-200 border ${
                                            isHovered 
                                              ? "shadow-[0_0_8px_rgba(74,222,128,0.25)] scale-[1.01] z-10" 
                                              : ""
                                          } ${
                                            isCompleted
                                              ? isHovered 
                                                ? "bg-emerald-500/25 border-emerald-400 text-emerald-300"
                                                : "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                                              : isGenerating
                                                ? "bg-amber-500/15 border-amber-500/40 text-amber-500 animate-pulse"
                                                : isFailed
                                                  ? "bg-red-500/15 border-red-500/40 text-red-400"
                                                  : "bg-[#1A1D24] border-[#2D3036]/80 text-[#8E9299]"
                                          }`}
                                          style={{
                                            left: `${startPct}%`,
                                            width: `${Math.max(6, widthPct)}%`,
                                          }}
                                          title={`Segment ${idx + 1}: ${item.voiceName} (${seg.duration.toFixed(1)}s)\nText: "${item.text}"`}
                                          onClick={() => {
                                            if (isCompleted) {
                                              handlePlayBulkItem(item);
                                            }
                                          }}
                                        >
                                          <span className="truncate max-w-full">
                                            [{idx + 1}] {item.voiceName} ({seg.duration.toFixed(1)}s)
                                          </span>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>

                                {/* Continuous track footer */}
                                <div className="border-t border-[#2D3036]/40 pt-1.5 shrink-0">
                                  <div className="text-[7.5px] text-[#5C616A] uppercase tracking-wider mb-1 font-bold flex justify-between">
                                    <span>Linear Assembly Flow</span>
                                    <span>{totalDuration.toFixed(1)}s total</span>
                                  </div>
                                  <div className="h-4.5 bg-[#121419] rounded border border-[#2D3036] flex overflow-hidden relative">
                                    {bulkItems.map((item, idx) => {
                                      const seg = timelineSegments[idx];
                                      if (!seg) return null;
                                      const isHovered = hoveredSegmentIndex === idx;
                                      const isCompleted = item.status === "completed";
                                      const widthPct = (seg.duration / totalDuration) * 100;

                                      return (
                                        <div
                                          key={item.id}
                                          onMouseEnter={() => setHoveredSegmentIndex(idx)}
                                          onMouseLeave={() => setHoveredSegmentIndex(null)}
                                          className={`h-full transition-all border-r border-[#0B0C0E]/40 last:border-r-0 cursor-pointer flex items-center justify-center text-[7px] font-bold ${
                                            isHovered
                                              ? "bg-[#4ADE80] text-[#0B0C0E] font-extrabold shadow-inner"
                                              : isCompleted
                                                ? "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
                                                : item.status === "generating"
                                                  ? "bg-amber-500/20 text-amber-500 animate-pulse"
                                                  : item.status === "failed"
                                                    ? "bg-red-500/20 text-red-400"
                                                    : "bg-[#1C1F26] text-[#5C616A] hover:bg-[#2C313C]"
                                          }`}
                                          style={{ width: `${widthPct}%` }}
                                          title={`Segment ${idx + 1} (${seg.duration.toFixed(1)}s)`}
                                          onClick={() => {
                                            if (isCompleted) {
                                              handlePlayBulkItem(item);
                                            }
                                          }}
                                        >
                                          <span className="truncate px-0.5">
                                            {idx + 1}
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="max-h-[220px] overflow-y-auto divide-y divide-[#2D3036]/60 text-xs font-mono">
                    {bulkItems.length === 0 ? (
                      <div className="p-6 text-center text-[#5C616A] uppercase tracking-wide text-[9.5px]">
                        Queue is completely empty. Load presets or type above.
                      </div>
                    ) : (() => {
                      const filtered = bulkItems.map((item, idx) => ({ item, originalIdx: idx }))
                        .filter(({ item }) => {
                          if (bulkFilter === "all") return true;
                          return item.status === bulkFilter;
                        });

                      if (filtered.length === 0) {
                        return (
                          <div className="p-8 text-center text-[#5C616A] uppercase tracking-wide text-[9px]">
                            No scripts in queue match the "{bulkFilter}" filter
                          </div>
                        );
                      }

                      return filtered.map(({ item, originalIdx }) => {
                        const isCurrent = isGeneratingBulk && bulkProgressIndex === originalIdx;
                        const isEditing = editingBulkItemId === item.id;

                        if (isEditing) {
                          return (
                            <div 
                              key={item.id} 
                              className="p-3.5 bg-blue-950/20 border-l-2 border-blue-500 space-y-3 font-mono text-xs transition-colors"
                            >
                              <div className="flex items-center justify-between text-[9px] text-[#8E9299] uppercase font-bold">
                                <span>Editing Item [{String(originalIdx + 1).padStart(2, "0")}]</span>
                                <span className="text-blue-400 font-bold">Inline Editor</span>
                              </div>
                              <div className="space-y-1.5">
                                <label className="text-[8px] text-[#5C616A] uppercase font-bold block">Script Text</label>
                                <textarea
                                  value={editingBulkText}
                                  onChange={(e) => setEditingBulkText(e.target.value)}
                                  className="w-full bg-[#0B0C0E] border border-[#2D3036] rounded p-2 text-xs font-sans text-white focus:outline-none focus:border-blue-500/60 leading-relaxed resize-y h-16"
                                />
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                  <label className="text-[8px] text-[#5C616A] uppercase font-bold block">Voice Model</label>
                                  <select
                                    value={editingBulkVoice}
                                    onChange={(e) => setEditingBulkVoice(e.target.value)}
                                    className="w-full bg-[#0B0C0E] border border-[#2D3036] rounded p-1.5 text-[10px] text-slate-300 font-mono focus:outline-none focus:border-blue-500/60 cursor-pointer"
                                  >
                                    {VOICES.map(v => (
                                      <option key={v.name} value={v.name}>{v.name}</option>
                                    ))}
                                  </select>
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[8px] text-[#5C616A] uppercase font-bold block">Tone Description</label>
                                  <input
                                    type="text"
                                    value={editingBulkTone}
                                    onChange={(e) => setEditingBulkTone(e.target.value)}
                                    className="w-full bg-[#0B0C0E] border border-[#2D3036] rounded p-1.5 text-[10px] text-slate-300 font-mono focus:outline-none focus:border-blue-500/60"
                                  />
                                </div>
                              </div>
                              <div className="flex items-center justify-end gap-1.5 pt-1">
                                <button
                                  type="button"
                                  onClick={() => setEditingBulkItemId(null)}
                                  className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-[#8E9299] text-[9px] rounded font-bold uppercase transition-all cursor-pointer"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const didChange = item.text !== editingBulkText || item.voiceName !== editingBulkVoice || item.toneDescription !== editingBulkTone;
                                    updateBulkItemsWithUndo(prev => prev.map(p => p.id === item.id ? {
                                      ...p,
                                      text: editingBulkText,
                                      voiceName: editingBulkVoice,
                                      toneDescription: editingBulkTone,
                                      status: didChange ? "idle" : p.status,
                                      base64Audio: didChange ? undefined : p.base64Audio,
                                      audioBuffer: didChange ? undefined : p.audioBuffer,
                                      duration: didChange ? undefined : p.duration,
                                    } : p));
                                    setEditingBulkItemId(null);
                                  }}
                                  className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-[9px] rounded font-bold uppercase transition-all cursor-pointer"
                                >
                                  Save Change
                                </button>
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div 
                            key={item.id} 
                            className={`p-3 flex flex-col md:flex-row md:items-center justify-between gap-3 transition-colors ${
                              isCurrent 
                                ? "bg-[#4ADE80]/5" 
                                : item.status === "completed" 
                                  ? "bg-emerald-950/5 hover:bg-emerald-950/10" 
                                  : "hover:bg-[#15171C]/40"
                            }`}
                          >
                            {/* Left part: text and tags */}
                            <div className="space-y-1.5 flex-grow">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[9.5px] text-[#5C616A] font-bold">
                                  [{String(originalIdx + 1).padStart(2, "0")}]
                                </span>
                                <span className="text-white font-sans text-xs font-medium line-clamp-1 flex-grow pr-4">
                                  {item.text}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 flex-wrap text-[9px] text-[#8E9299]">
                                <span className="px-1.5 py-0.5 bg-[#15171C] border border-[#2D3036] rounded font-bold uppercase text-[#4ADE80]">
                                  Voice: {item.voiceName}
                                </span>
                                <span className="text-[#5C616A] truncate max-w-xs" title={item.toneDescription}>
                                  Tone: {item.toneDescription}
                                </span>
                              </div>
                            </div>

                            {/* Right part: status and actions */}
                            <div className="flex items-center gap-3 justify-between md:justify-end">
                              <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase">
                                {item.status === "idle" && (
                                  <span className="text-[#5C616A] flex items-center gap-1">
                                    <span className="h-1.5 w-1.5 rounded-full bg-[#5C616A]" />
                                    Idle
                                  </span>
                                )}
                                {item.status === "generating" && (
                                  <span className="text-[#4ADE80] flex items-center gap-1.5 animate-pulse bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded">
                                    <RefreshCw className="h-3 w-3 animate-spin" />
                                    <span className="truncate max-w-[120px]" title={item.progressText || "Synthesizing..."}>
                                      {item.progressText || "Synthesizing..."}
                                    </span>
                                  </span>
                                )}
                                {item.status === "completed" && (
                                  <span className="text-emerald-400 flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded">
                                    <Check className="h-3 w-3" />
                                    {item.duration ? `${item.duration.toFixed(1)}s` : "Done"}
                                  </span>
                                )}
                                {item.status === "failed" && (
                                  <span className="text-[#FF4444] flex items-center gap-1.5 bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 rounded" title={item.error}>
                                    <AlertCircle className="h-3 w-3 shrink-0" />
                                    <span className="truncate max-w-[150px]" title={item.error}>
                                      {item.progressText || "Fail"}
                                    </span>
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-1.5">
                                {item.status === "completed" && (
                                  <>
                                    <div className="mr-1" title="Synthesized audio waveform signature">
                                      <BulkItemWaveform buffer={item.audioBuffer} />
                                    </div>
                                    <button
                                      onClick={() => handlePlayBulkItem(item)}
                                      className="p-1.5 bg-[#4ADE80]/10 hover:bg-[#4ADE80]/20 text-[#4ADE80] border border-[#4ADE80]/20 hover:border-[#4ADE80]/40 rounded transition-colors cursor-pointer"
                                      title="Play voiceover in master visualizer"
                                    >
                                      <Play className="h-3.5 w-3.5 fill-current" />
                                    </button>
                                    <button
                                      onClick={() => handleDownloadWavForItem(item.base64Audio!, item.voiceName, item.text)}
                                      className="p-1.5 bg-neutral-800 hover:bg-neutral-700 text-white border border-[#2D3036] rounded transition-colors cursor-pointer"
                                      title="Download item WAV"
                                    >
                                      <Download className="h-3.5 w-3.5" />
                                    </button>
                                  </>
                                )}
                                <button
                                  onClick={() => {
                                    setEditingBulkItemId(item.id);
                                    setEditingBulkText(item.text);
                                    setEditingBulkVoice(item.voiceName);
                                    setEditingBulkTone(item.toneDescription);
                                  }}
                                  className="p-1.5 hover:bg-blue-500/10 text-[#5C616A] hover:text-blue-400 border border-transparent hover:border-blue-500/20 rounded transition-colors cursor-pointer"
                                  title="Edit script / settings"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => updateBulkItemsWithUndo(prev => prev.filter(p => p.id !== item.id))}
                                  className="p-1.5 hover:bg-[#FF4444]/10 text-[#5C616A] hover:text-[#FF4444] border border-transparent hover:border-[#FF4444]/20 rounded transition-colors cursor-pointer"
                                  title="Remove from batch"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                )}
              </div>

              {/* Bulk Actions Console Controls */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-[#2D3036]/60 font-mono">
                <button
                  onClick={handleGenerateBulkBatch}
                  disabled={isGeneratingBulk || bulkItems.length === 0}
                  className={`col-span-1 sm:col-span-1 py-3 px-4 rounded text-xs font-mono font-bold tracking-widest uppercase transition-all flex items-center justify-center gap-2 border cursor-pointer ${
                    isGeneratingBulk || bulkItems.length === 0
                      ? "bg-[#15171C] border-[#2D3036] text-[#5C616A]"
                      : "bg-[#4ADE80] hover:bg-[#22C55E] border-none text-[#0B0C0E] hover:scale-[1.01] hover:shadow-[0_0_12px_rgba(74,222,128,0.3)] active:scale-[0.99]"
                  }`}
                >
                  {isGeneratingBulk ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin animate-duration-1000" />
                      <span>Generating [{bulkProgressIndex + 1}/{bulkItems.length}]</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>Process Batch</span>
                    </>
                  )}
                </button>

                <button
                  onClick={handleDownloadAllAsZip}
                  disabled={isGeneratingBulk || !bulkItems.some(i => i.status === "completed")}
                  className={`py-3 px-4 rounded text-xs font-mono font-bold tracking-widest uppercase transition-all flex items-center justify-center gap-2 border cursor-pointer ${
                    isGeneratingBulk || !bulkItems.some(i => i.status === "completed")
                      ? "bg-[#15171C] border-[#2D3036] text-[#5C616A]"
                      : "bg-purple-600 hover:bg-purple-500 border-none text-white hover:scale-[1.01] hover:shadow-[0_0_12px_rgba(147,51,234,0.3)] active:scale-[0.99]"
                  }`}
                >
                  <DownloadCloud className="h-3.5 w-3.5" />
                  <span>Zip Export</span>
                </button>

                <button
                  onClick={() => {
                    if (window.confirm("Are you sure you want to clear the batch queue? All cached states will be cleared.")) {
                      updateBulkItemsWithUndo([]);
                      setBulkInputText("");
                    }
                  }}
                  className="py-3 px-4 rounded text-xs font-mono font-bold tracking-widest uppercase transition-all flex items-center justify-center gap-2 border border-[#FF4444]/30 text-[#FF4444] hover:bg-[#FF4444]/15 active:scale-[0.99] cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Reset</span>
                </button>
              </div>
              </div>
            )}
          </section>

          {/* Interactive Player, Wave visualizer, and Output Info */}
          <section className="bg-[#0F1115] border border-[#2D3036] rounded p-5 shadow-xl space-y-5">
            <div className="flex items-center justify-between border-b border-[#2D3036] pb-3">
              <div className="flex items-center gap-2">
                <FileAudio className="h-4 w-4 text-[#4ADE80]" />
                <h3 className="text-[10px] uppercase tracking-widest text-[#5C616A] font-mono font-bold">
                  04 / Master Bus Output Console
                </h3>
              </div>
              <div className="flex items-center gap-3">
                {(base64Audio || audioA || audioB) && (
                  <button 
                    onClick={() => {
                      stopAudio();
                      setBase64Audio(null);
                      setSilenceReport(null);
                      if (isComparisonMode) {
                        setAudioA(null);
                        setAudioB(null);
                        setAudioBufferA(null);
                        setAudioBufferB(null);
                        setSilenceReportA(null);
                        setSilenceReportB(null);
                      }
                    }}
                    className="text-[9px] text-[#FF4444] hover:text-[#EF4444] hover:underline font-mono uppercase tracking-wider flex items-center gap-1 transition-all"
                    title="Delete generated audio recording buffer (destructive action)"
                    id="btn-delete-recording"
                  >
                    [Delete Recording]
                  </button>
                )}
                {(base64Audio || audioA || audioB) && (
                  <span className="text-[9px] text-[#4ADE80] font-mono px-2 py-0.5 bg-[#4ADE80]/10 border border-[#4ADE80]/20 rounded animate-pulse">
                    SYNC LOCKED
                  </span>
                )}
              </div>
            </div>

            {/* Tactical Side-by-Side Dual-Track Transient Waveform Comparator */}
            {isComparisonMode && (audioBufferA || audioBufferB) && (
              <div className="space-y-2 border-b border-[#2D3036] pb-3.5">
                <div className="flex items-center justify-between text-[9px] font-mono uppercase tracking-wider text-[#8E9299]">
                  <span className="font-bold text-[#4ADE80]">Dual-Channel Transient Comparator:</span>
                  <span>Click slot card below to swap & play</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <MiniWaveformCompare 
                    buffer={audioBufferA} 
                    title={`Slot A: ${comparisonVoiceA}`} 
                    isActive={activePlaySlot === "A"} 
                    onClick={() => switchPlaySlot("A")}
                  />
                  <MiniWaveformCompare 
                    buffer={audioBufferB} 
                    title={`Slot B: ${comparisonVoiceB}`} 
                    isActive={activePlaySlot === "B"} 
                    onClick={() => switchPlaySlot("B")}
                  />
                </div>
              </div>
            )}

            {/* Simulated Live wave / active frequency canvas (Industrial styling) */}
            <div className="relative bg-[#0B0C0E] border border-[#2D3036] rounded overflow-hidden p-4 flex flex-col justify-between h-32 group">
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#4ADE80]/5 via-transparent to-transparent opacity-50 pointer-events-none" />
              
              <div className="flex items-center justify-between z-10">
                <span className="text-[9px] font-mono text-[#8E9299] uppercase tracking-wider flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${isPlaying ? "bg-[#4ADE80] animate-pulse shadow-[0_0_8px_rgba(74,222,128,0.8)]" : "bg-[#5C616A]"}`} />
                  {isPlaying 
                    ? `Live Output - ${isComparisonMode ? `Slot ${activePlaySlot} [${activePlaySlot === "A" ? comparisonVoiceA : comparisonVoiceB}]` : selectedVoice}`
                    : isComparisonMode 
                      ? `Inspect Mode - Slot ${activePlaySlot} [${activePlaySlot === "A" ? comparisonVoiceA : comparisonVoiceB}]`
                      : "No Input Signal Detected"
                  }
                </span>
                <span className="text-[9px] font-mono text-[#5C616A] uppercase tracking-widest">
                  {isPlaying ? "ACTIVE SPECTRUM" : "STATIONARY BUS"}
                </span>
              </div>

              {/* Core Canvas element */}
              <canvas 
                ref={canvasRef} 
                width={600} 
                height={60} 
                className={`w-full h-16 z-10 select-none ${base64Audio ? "cursor-ew-resize" : "pointer-events-none"}`}
                onMouseDown={handleCanvasMouseDown}
                onMouseMove={handleCanvasMouseMove}
                onMouseUp={handleCanvasMouseUpOrLeave}
                onMouseLeave={handleCanvasMouseUpOrLeave}
                onTouchStart={handleCanvasTouchStart}
                onTouchMove={handleCanvasTouchMove}
                onTouchEnd={handleCanvasMouseUpOrLeave}
              />

              <div className="flex items-center justify-between z-10 text-[9px] font-mono text-[#5C616A]">
                <span>
                  {isComparisonMode ? `SLOT ${activePlaySlot} PEAK: ` : "BUS PEAK: "}
                  {base64Audio 
                    ? normalizeAudio 
                      ? "-1.0dB (NORMALIZED)" 
                      : `${audioPeakDb.toFixed(1)}dB`
                    : "STATIONARY (-INF)"
                  }
                </span>
                <span>SYSTEM CORE: AES-256</span>
              </div>
            </div>

            {/* Transient Waveform Zoom & Panning Tool */}
            <div className="bg-[#121418] border border-[#2D3036] p-3 rounded flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 font-mono text-[10px] z-10 select-none">
              <div className="flex items-center gap-3 flex-1">
                <span className="text-[#8E9299] uppercase tracking-wider font-bold">Zoom:</span>
                <input
                  type="range"
                  min="1"
                  max="16"
                  step="0.5"
                  value={waveformZoom}
                  onChange={(e) => {
                    const z = parseFloat(e.target.value);
                    setWaveformZoom(z);
                    if (z === 1) setWaveformPan(0);
                  }}
                  className="flex-1 h-1 bg-[#1A1D24] rounded-lg appearance-none cursor-pointer accent-[#4ADE80]"
                  id="waveform-zoom-slider"
                  title="Zoom into audio transients / micro-details"
                />
                <span className="text-[#4ADE80] min-w-[32px] text-right font-bold">{waveformZoom.toFixed(1)}x</span>
              </div>

              {waveformZoom > 1 && (
                <div className="flex items-center gap-3 flex-1 sm:border-l sm:border-[#2D3036] sm:pl-4">
                  <span className="text-[#8E9299] uppercase tracking-wider font-bold">Scan:</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={waveformPan}
                    onChange={(e) => setWaveformPan(parseInt(e.target.value))}
                    className="flex-1 h-1 bg-[#1A1D24] rounded-lg appearance-none cursor-pointer accent-[#4ADE80]"
                    id="waveform-pan-slider"
                    title="Pan viewport left or right"
                  />
                  <span className="text-white min-w-[32px] text-right font-bold">{waveformPan}%</span>
                </div>
              )}
            </div>

            {/* Precision Interactive Audio Trimming Console */}
            {base64Audio && (
              <div className="bg-[#121418] border border-[#2D3036] p-3.5 rounded space-y-3 font-mono text-[10px] z-10 select-none">
                <div className="flex items-center justify-between text-[#8E9299] uppercase font-bold tracking-wider text-[9px] border-b border-[#2D3036]/50 pb-1.5">
                  <span className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                    Interactive Audio Trimmer
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setTrimStartRatio(0);
                        setTrimEndRatio(1);
                      }}
                      className="text-[9px] text-[#8E9299] hover:text-[#4ADE80] border border-[#2D3036] hover:border-[#4ADE80]/30 px-1.5 py-0.5 rounded transition-all"
                      title="Reset start and end trim boundaries to full length"
                    >
                      Reset Trim
                    </button>
                    <span className="text-[#4ADE80]">Direct-to-Export Slicing</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-[9px]">
                      <span className="text-[#8E9299] uppercase font-bold text-amber-500">Trim Start Marker:</span>
                      <span className="text-amber-500 font-bold">
                        {(trimStartRatio * audioDuration).toFixed(2)}s ({(trimStartRatio * 100).toFixed(0)}%)
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.005"
                        value={trimStartRatio}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          setTrimStartRatio(Math.min(val, trimEndRatio - 0.02));
                        }}
                        className="flex-grow h-1 bg-[#1A1D24] rounded-lg appearance-none cursor-pointer accent-amber-500"
                        title="Drag to trim silent or filler sections from the beginning"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-[9px]">
                      <span className="text-[#8E9299] uppercase font-bold text-red-500">Trim End Marker:</span>
                      <span className="text-red-500 font-bold">
                        {(trimEndRatio * audioDuration).toFixed(2)}s ({(trimEndRatio * 100).toFixed(0)}%)
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.005"
                        value={trimEndRatio}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          setTrimEndRatio(Math.max(val, trimStartRatio + 0.02));
                        }}
                        className="flex-grow h-1 bg-[#1A1D24] rounded-lg appearance-none cursor-pointer accent-red-500"
                        title="Drag to trim trailing silent or filler sections from the end"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-[9px] text-[#8E9299] border-t border-[#2D3036]/50 pt-2 bg-[#0B0C0E]/30 p-2 rounded">
                  <div className="flex items-center gap-1.5 col-span-2">
                    <span className="text-[#5C616A]">Original:</span>
                    <span className="text-white font-bold">{audioDuration.toFixed(2)}s</span>
                    <span className="text-[#5C616A] ml-2">Active Playback/Export:</span>
                    <span className="text-[#4ADE80] font-bold">
                      {((trimEndRatio - trimStartRatio) * audioDuration).toFixed(2)}s
                    </span>
                  </div>
                  <span className="text-[#5C616A] text-[8px] italic">
                    💡 Drag orange and red vertical handles directly on the waveform to visual-trim!
                  </span>
                </div>
              </div>
            )}

            {/* Visual Fade-In / Fade-Out Transient Settings */}
            <div className="bg-[#121418] border border-[#2D3036] p-3.5 rounded space-y-3 font-mono text-[10px] z-10 select-none">
              <div className="flex items-center justify-between text-[#8E9299] uppercase font-bold tracking-wider text-[9px] border-b border-[#2D3036]/50 pb-1.5">
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
                  Transient Fade Envelopes
                </span>
                <span className="text-[#4ADE80]">Anti-Click / Pop Filter</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-[9px]">
                    <span className="text-[#8E9299] uppercase font-bold">Fade-In Duration:</span>
                    <span className="text-blue-400 font-bold">{fadeInDuration.toFixed(2)}s</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min="0.00"
                      max="1.50"
                      step="0.01"
                      value={fadeInDuration}
                      onChange={(e) => setFadeInDuration(parseFloat(e.target.value))}
                      className="flex-grow h-1 bg-[#1A1D24] rounded-lg appearance-none cursor-pointer accent-blue-500"
                      id="fade-in-slider"
                      title="Adjust fade-in envelope length to avoid initial transient pop"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-[9px]">
                    <span className="text-[#8E9299] uppercase font-bold">Fade-Out Duration:</span>
                    <span className="text-blue-400 font-bold">{fadeOutDuration.toFixed(2)}s</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min="0.00"
                      max="1.50"
                      step="0.01"
                      value={fadeOutDuration}
                      onChange={(e) => setFadeOutDuration(parseFloat(e.target.value))}
                      className="flex-grow h-1 bg-[#1A1D24] rounded-lg appearance-none cursor-pointer accent-blue-500"
                      id="fade-out-slider"
                      title="Adjust fade-out envelope length to avoid trailing clicks"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Errors block */}
            <AnimatePresence>
              {error && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded p-3 flex items-start gap-2.5"
                >
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold block font-mono text-[10px] uppercase">Acoustic Signal Error:</span>
                    <span className="opacity-90">{error}</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Audio Controls Block */}
            <div className="space-y-4">
              
              {/* Playback Seek slider bar */}
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] text-[#8E9299] font-mono">
                  <span>{Math.floor(currentTime / 60)}:{(currentTime % 60).toFixed(0).padStart(2, "0")}</span>
                  <span>{Math.floor(audioDuration / 60)}:{(audioDuration % 60).toFixed(0).padStart(2, "0")}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={playbackProgress}
                  onChange={handleSeek}
                  disabled={!base64Audio}
                  className="w-full h-1 bg-[#1A1C20] rounded appearance-none cursor-pointer accent-[#4ADE80] disabled:opacity-30 disabled:cursor-not-allowed"
                />
              </div>

              {/* Core Buttons Layout */}
              <div className="flex flex-wrap items-center justify-between gap-4">
                
                <div className="flex items-center gap-2">
                  {/* Play / Pause button */}
                  <button
                    onClick={playAudio}
                    disabled={!base64Audio}
                    className={`h-11 px-5 rounded text-xs font-mono font-bold tracking-widest uppercase flex items-center gap-2 transition-all ${
                      !base64Audio 
                        ? "bg-[#15171C] border border-[#2D3036] text-[#5C616A] cursor-not-allowed"
                        : isPlaying 
                          ? "bg-[#4ADE80]/10 hover:bg-[#4ADE80]/20 border border-[#4ADE80] text-[#4ADE80]"
                          : "bg-[#4ADE80] hover:bg-[#22C55E] text-[#0B0C0E] border-none hover:scale-[1.02]"
                    }`}
                    id="btn-play-pause-control"
                  >
                    {isPlaying ? (
                      <>
                        <Pause className="h-4 w-4 fill-current" />
                        <span>PAUSE</span>
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4 fill-current" />
                        <span>PLAY MASTER</span>
                      </>
                    )}
                  </button>

                  {/* Stop / Reset button */}
                  <button
                    onClick={stopAudio}
                    disabled={!base64Audio}
                    className="h-11 w-11 rounded border border-[#2D3036] bg-[#15171C] hover:bg-[#1C1F26] hover:border-[#5C616A] flex items-center justify-center text-[#8E9299] hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    id="btn-stop-control"
                    title="Stop and Reset Playback"
                  >
                    <Square className="h-4 w-4 fill-current" />
                  </button>
                </div>

                {/* Auto Normalizer Toggle Switch */}
                <div className="flex items-center gap-2.5 border border-[#2D3036] bg-[#0B0C0E] px-3 h-11 rounded select-none">
                  <button
                    onClick={() => setNormalizeAudio(!normalizeAudio)}
                    disabled={!base64Audio}
                    className="flex items-center gap-2 text-xs font-mono disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    id="btn-normalize-toggle"
                    title="Normalize output peak level to -1.0dB"
                  >
                    <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center border transition-all ${
                      normalizeAudio 
                        ? "bg-[#4ADE80] border-[#4ADE80] shadow-[0_0_8px_rgba(74,222,128,0.6)]" 
                        : "bg-transparent border-[#2D3036]"
                    }`}>
                      {normalizeAudio && (
                        <div className="w-1.5 h-1.5 bg-white rounded-full" />
                      )}
                    </div>
                    <span className={`text-[9px] font-bold tracking-wider uppercase ${normalizeAudio ? "text-white" : "text-[#8E9299]"}`}>
                      NORMALIZE AUDIO (-1.0dB)
                    </span>
                  </button>
                </div>

                {/* Live Volume controller */}
                <div className="flex items-center gap-2.5">
                  <button
                    onClick={() => setIsMuted(!isMuted)}
                    disabled={!base64Audio}
                    className="text-[#8E9299] hover:text-white transition-colors disabled:opacity-40"
                    title={isMuted ? "Unmute" : "Mute"}
                  >
                    {isMuted || volume === 0 ? (
                      <VolumeX className="h-4 w-4 text-[#8E9299]" />
                    ) : (
                      <Volume2 className="h-4 w-4" />
                    )}
                  </button>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={volume}
                    onChange={(e) => setVolume(parseFloat(e.target.value))}
                    disabled={!base64Audio}
                    className="w-24 h-1 bg-[#1A1C20] rounded appearance-none cursor-pointer accent-[#4ADE80] disabled:opacity-30"
                  />
                  <span className="text-[10px] font-mono text-[#5C616A] w-8">
                    {Math.round(volume * 100)}%
                  </span>
                </div>

                {/* Download and Export Buttons group */}
                <div className="flex flex-col gap-2.5 w-full">
                  <div className="flex items-center gap-3 flex-wrap">
                    {/* Format Selection Dropdown */}
                    <div className="flex items-center gap-2 bg-[#0B0C0E] border border-[#2D3036] px-3 h-11 rounded select-none">
                      <span className="text-[9px] font-mono text-[#8E9299] font-bold uppercase tracking-wider">
                        Format:
                      </span>
                      <select
                        value={exportFormat}
                        onChange={(e) => setExportFormat(e.target.value as any)}
                        disabled={!base64Audio || isExportingMp3 || isExportingOgg}
                        className="bg-[#15171C] border border-[#2D3036] text-[#4ADE80] rounded px-2 py-0.5 text-[10px] font-mono font-bold focus:outline-none focus:border-[#4ADE80]/50 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        id="export-format-select"
                        title="Select the acoustic output container format"
                      >
                        <option value="wav" className="bg-[#15171C] text-[#4ADE80]">WAV (Lossless)</option>
                        <option value="mp3" className="bg-[#15171C] text-[#4ADE80]">MP3 (192K)</option>
                        <option value="ogg" className="bg-[#15171C] text-[#4ADE80]">OGG (Vorbis)</option>
                      </select>
                    </div>

                    {/* Dynamic Action Export Button */}
                    {exportFormat === "wav" && (
                      <button
                        onClick={downloadWav}
                        disabled={!base64Audio || isExportingMp3 || isExportingOgg}
                        className={`h-11 px-4 rounded text-xs font-mono font-bold tracking-widest uppercase flex items-center gap-2 transition-all ${
                          !base64Audio
                            ? "bg-[#15171C] border border-[#2D3036] text-[#5C616A] cursor-not-allowed"
                            : "bg-[#15171C] hover:bg-[#1C1F26] text-white border border-[#2D3036] hover:border-[#5C616A] hover:scale-[1.02]"
                        }`}
                        id="btn-download-wav"
                        title="Download lossless stereo WAV format"
                      >
                        <Download className="h-4 w-4 text-[#4ADE80]" />
                        <span>DOWNLOAD WAV</span>
                      </button>
                    )}

                    {exportFormat === "mp3" && (
                      <button
                        onClick={exportCompressedMp3}
                        disabled={!base64Audio || isExportingMp3 || isExportingOgg}
                        className={`h-11 px-4 rounded text-xs font-mono font-bold tracking-widest uppercase flex items-center gap-2 transition-all relative overflow-hidden ${
                          !base64Audio
                            ? "bg-[#15171C] border border-[#2D3036] text-[#5C616A] cursor-not-allowed"
                            : isExportingMp3
                              ? "bg-[#15171C] border border-emerald-500/40 text-emerald-400 cursor-wait"
                              : "bg-[#4ADE80] hover:bg-[#22C55E] text-[#0B0C0E] border-none hover:scale-[1.02] hover:shadow-[0_0_10px_rgba(74,222,128,0.3)] cursor-pointer"
                        }`}
                        id="btn-export-mp3"
                        title="Encode & Download compressed MP3 format"
                      >
                        {isExportingMp3 && (
                          <div 
                            className="absolute inset-y-0 left-0 bg-emerald-500/10 transition-all duration-150 ease-out" 
                            style={{ width: `${mp3ExportProgress}%` }}
                          />
                        )}
                        
                        <span className="relative z-10 flex items-center gap-2">
                          {isExportingMp3 ? (
                            <>
                              <RefreshCw className="h-4 w-4 animate-spin" />
                              <span>ENCODING {mp3ExportProgress}%</span>
                            </>
                          ) : (
                            <>
                              <Sparkles className="h-4 w-4" />
                              <span>EXPORT MP3</span>
                            </>
                          )}
                        </span>
                      </button>
                    )}

                    {exportFormat === "ogg" && (
                      <button
                        onClick={exportCompressedOgg}
                        disabled={!base64Audio || isExportingMp3 || isExportingOgg}
                        className={`h-11 px-4 rounded text-xs font-mono font-bold tracking-widest uppercase flex items-center gap-2 transition-all relative overflow-hidden ${
                          !base64Audio
                            ? "bg-[#15171C] border border-[#2D3036] text-[#5C616A] cursor-not-allowed"
                            : isExportingOgg
                              ? "bg-[#15171C] border border-emerald-500/40 text-emerald-400 cursor-wait"
                              : "bg-[#4ADE80] hover:bg-[#22C55E] text-[#0B0C0E] border-none hover:scale-[1.02] hover:shadow-[0_0_10px_rgba(74,222,128,0.3)] cursor-pointer"
                        }`}
                        id="btn-export-ogg"
                        title="Encode & Download compressed OGG format"
                      >
                        {isExportingOgg && (
                          <div 
                            className="absolute inset-y-0 left-0 bg-emerald-500/10 transition-all duration-150 ease-out" 
                            style={{ width: `${oggExportProgress}%` }}
                          />
                        )}
                        
                        <span className="relative z-10 flex items-center gap-2">
                          {isExportingOgg ? (
                            <>
                              <RefreshCw className="h-4 w-4 animate-spin" />
                              <span>ENCODING {oggExportProgress}%</span>
                            </>
                          ) : (
                            <>
                              <Sparkles className="h-4 w-4" />
                              <span>EXPORT OGG</span>
                            </>
                          )}
                        </span>
                      </button>
                    )}

                    {/* Premium Audio Sharing Link Trigger */}
                    <button
                      onClick={handleShareAudio}
                      disabled={!base64Audio || isSharing}
                      className={`h-11 px-4 rounded text-xs font-mono font-bold tracking-widest uppercase flex items-center gap-2 transition-all ${
                        !base64Audio || isSharing
                          ? "bg-[#15171C] border border-[#2D3036] text-[#5C616A] cursor-not-allowed"
                          : "bg-blue-600 hover:bg-blue-500 text-white border-none hover:scale-[1.02] hover:shadow-[0_0_10px_rgba(59,130,246,0.3)] cursor-pointer"
                      }`}
                      id="btn-share-audio"
                      title="Generate a temporary shareable URL for this voiceover and copy it to clipboard"
                    >
                      {isSharing ? (
                        <>
                          <RefreshCw className="h-4 w-4 animate-spin" />
                          <span>SHARING...</span>
                        </>
                      ) : copySuccess ? (
                        <>
                          <Check className="h-4 w-4 text-[#4ADE80]" />
                          <span>LINK COPIED!</span>
                        </>
                      ) : (
                        <>
                          <Share2 className="h-4 w-4" />
                          <span>SHARE LINK</span>
                        </>
                      )}
                    </button>
                  </div>

                  {shareError && (
                    <div className="text-[10px] text-rose-400 font-mono mt-1 flex items-center gap-1.5 bg-rose-950/20 border border-rose-500/20 p-2 rounded">
                      <AlertCircle className="h-3.5 w-3.5 text-rose-500" />
                      <span>Failed to create share link: {shareError}</span>
                    </div>
                  )}

                  {shareUrl && (
                    <div className="bg-[#0B0C0E]/90 border border-blue-500/30 rounded p-3 space-y-2 shadow-inner">
                      <div className="flex items-center justify-between text-[9px] font-mono text-[#8E9299]">
                        <span className="flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                          TEMPORARY CLOUD AUDIO LINK (EXPIRES IN 24H)
                        </span>
                        <span className="text-blue-400 font-bold">READY</span>
                      </div>
                      <div className="flex gap-2 items-center">
                        <input
                          type="text"
                          readOnly
                          value={shareUrl}
                          className="flex-1 bg-[#14161B] border border-[#2D3036] text-[10px] font-mono text-slate-300 p-2 rounded select-all focus:outline-none"
                          onClick={(e) => (e.target as HTMLInputElement).select()}
                        />
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(shareUrl);
                            setCopySuccess(true);
                            setTimeout(() => setCopySuccess(false), 3000);
                          }}
                          className="bg-blue-600/20 hover:bg-blue-600/40 border border-blue-500/30 text-blue-300 hover:text-white h-8 px-3 text-[10px] font-mono font-bold rounded transition-all cursor-pointer flex items-center gap-1"
                        >
                          <Link className="h-3 w-3" />
                          COPY
                        </button>
                      </div>
                    </div>
                  )}
                </div>

              </div>

            </div>

            {/* Audio Specifications block */}
            <div className="bg-[#0B0C0E] border border-[#2D3036] p-4 rounded space-y-2">
              <span className="text-[9px] font-mono text-[#5C616A] block uppercase tracking-widest">
                HARDWARE BUS SPECIFICATIONS (MONO CHANNEL)
              </span>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs font-mono">
                <div>
                  <span className="text-[#8E9299] block text-[9px]">SAMPLING RATE</span>
                  <span className="text-white font-medium">24.0 kHz</span>
                </div>
                <div>
                  <span className="text-[#8E9299] block text-[9px]">BIT DEPTH</span>
                  <span className="text-white font-medium">16-bit Linear PCM</span>
                </div>
                <div>
                  <span className="text-[#8E9299] block text-[9px]">CHANNELS</span>
                  <span className="text-white font-medium">1 (Analogue Dry)</span>
                </div>
                <div>
                  <span className="text-[#8E9299] block text-[9px]">ENCRYPT / COMPRESS</span>
                  <span className="text-white font-medium">WAV Container</span>
                </div>
              </div>
            </div>

            {/* Real-time highlighting reading tracker (Elegant serif blockquote layout matching Sophisticated Dark) */}
            {base64Audio && (
              <div className="bg-[#0B0C0E] border border-[#2D3036] p-5 rounded space-y-4">
                <span className="text-[10px] font-mono text-[#4ADE80] block uppercase tracking-widest flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#4ADE80] animate-pulse" />
                  VOICEOVER SCRIPT ALIGNMENT GUIDE
                </span>
                <div className="space-y-4 max-h-56 overflow-y-auto pr-1">
                  {sentences.map((sentence, idx) => {
                    const isActive = idx === activeSentenceIndex;
                    return (
                      <p 
                        key={idx}
                        className={`transition-all duration-300 pl-4 border-l ${
                          isActive 
                            ? "font-serif text-lg leading-relaxed text-[#F3F4F6] italic border-[#4ADE80] bg-[#4ADE80]/5 py-2 pr-2" 
                            : "text-[#5C616A] border-[#2D3036] font-sans text-xs"
                        }`}
                      >
                        {isActive ? `“${sentence}”` : sentence}
                      </p>
                    );
                  })}
                </div>
              </div>
            )}

          </section>

        </div>

      </main>

      {/* Footer disclaimer (Sophisticated Dark metadata bar) */}
      <footer className="h-12 bg-[#1A1C20] border-t border-[#2D3036] px-8 flex items-center justify-between text-[10px] font-mono text-[#5C616A] mt-auto">
        <div>
          PEAK SIGNAL:{" "}
          {base64Audio 
            ? normalizeAudio 
              ? "-1.0 dB (NORMALIZED)" 
              : `${audioPeakDb.toFixed(1)} dB`
            : "NONE"
          }
        </div>
        <div className="text-slate-300 font-sans font-medium text-xs flex items-center gap-1">
          Made with ❤️ by Alex
        </div>
        <div>SYS_VER: 4.12.0_DRY</div>
      </footer>

    </div>
  );
}
