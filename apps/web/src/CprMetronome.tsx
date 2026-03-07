import { useEffect, useRef, useState } from "react";

interface CprMetronomeProps {
  minBpm: number;
  maxBpm: number;
}

export const CprMetronome = ({ minBpm, maxBpm }: CprMetronomeProps) => {
  const [bpm, setBpm] = useState(Math.round((minBpm + maxBpm) / 2));
  const [active, setActive] = useState(false);
  const [beat, setBeat] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);

  const playTick = async () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new window.AudioContext();
    }

    if (audioContextRef.current.state === "suspended") {
      await audioContextRef.current.resume();
    }

    const context = audioContextRef.current;
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(880, context.currentTime);
    gain.gain.setValueAtTime(0.001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.04, context.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.07);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.08);
  };

  useEffect(() => {
    if (!active) {
      return;
    }

    let beatOffTimer: number | undefined;
    const intervalMs = Math.round(60000 / bpm);

    const runBeat = () => {
      setBeat(true);
      void playTick();
      beatOffTimer = window.setTimeout(() => setBeat(false), 120);
    };

    runBeat();
    const interval = window.setInterval(runBeat, intervalMs);

    return () => {
      window.clearInterval(interval);
      if (beatOffTimer) {
        window.clearTimeout(beatOffTimer);
      }
      setBeat(false);
    };
  }, [active, bpm]);

  return (
    <section className="metronome">
      <h3>CPR Rhythm Helper</h3>
      <p>Target range: {minBpm}-{maxBpm} compressions/minute.</p>

      <div className="metronome-controls">
        <label htmlFor="bpm">Set BPM</label>
        <input
          id="bpm"
          type="range"
          min={minBpm}
          max={maxBpm}
          value={bpm}
          onChange={(event) => setBpm(Number(event.target.value))}
        />
        <span>{bpm} BPM</span>
      </div>

      <button type="button" className="action-button" onClick={() => setActive((state) => !state)}>
        {active ? "Stop Metronome" : "Start Metronome"}
      </button>

      <div className={`beat-indicator ${beat ? "active" : ""}`}>Compression Cue</div>
    </section>
  );
};
