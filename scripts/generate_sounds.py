#!/usr/bin/env python3
"""
Generate procedural sound effects for the AOE PWA.

Uses only the Python standard library — no PIL, no numpy, no ffmpeg.
Each sound is synthesised from sine waves, noise, and ADSR envelopes,
written as a 16-bit mono WAV file at 22050 Hz sample-rate.

Run from the repo root:
    python3 scripts/generate_sounds.py
"""
import math
import os
import random
import struct
import wave

SAMPLE_RATE = 22050
OUT_ROOT = os.path.join(os.path.dirname(__file__), '..', 'public', 'audio')


# ----------------------------------------------------------------------
# Synthesis primitives
# ----------------------------------------------------------------------
def sine(freq, duration, amp=1.0, phase=0.0):
    n = int(SAMPLE_RATE * duration)
    return [
        amp * math.sin(2 * math.pi * freq * (i / SAMPLE_RATE) + phase)
        for i in range(n)
    ]


def square(freq, duration, amp=1.0):
    n = int(SAMPLE_RATE * duration)
    return [
        amp * (1.0 if math.sin(2 * math.pi * freq * (i / SAMPLE_RATE)) >= 0 else -1.0)
        for i in range(n)
    ]


def noise(duration, amp=1.0):
    n = int(SAMPLE_RATE * duration)
    return [amp * (random.random() * 2 - 1) for _ in range(n)]


def silence(duration):
    return [0.0] * int(SAMPLE_RATE * duration)


def envelope(samples, attack=0.01, decay=0.1, sustain=0.6, release=0.1):
    """Apply a simple ADSR envelope to a buffer in place."""
    n = len(samples)
    if n == 0:
        return samples
    a = max(1, int(attack * SAMPLE_RATE))
    d = max(1, int(decay * SAMPLE_RATE))
    r = max(1, int(release * SAMPLE_RATE))
    s = max(1, n - a - d - r)
    out = [0.0] * n
    for i in range(n):
        if i < a:
            env = i / a
        elif i < a + d:
            env = 1.0 - (1.0 - sustain) * ((i - a) / d)
        elif i < a + d + s:
            env = sustain
        else:
            env = sustain * max(0.0, 1.0 - (i - a - d - s) / r)
        out[i] = samples[i] * env
    return out


def fade_out(samples, fade=0.05):
    n = len(samples)
    f = max(1, int(fade * SAMPLE_RATE))
    out = list(samples)
    for i in range(max(0, n - f), n):
        out[i] *= max(0.0, (n - i) / f)
    return out


def mix(*tracks):
    n = max((len(t) for t in tracks), default=0)
    out = [0.0] * n
    for t in tracks:
        for i, v in enumerate(t):
            out[i] += v
    return out


def gain(samples, g):
    return [s * g for s in samples]


def concat(*tracks):
    out = []
    for t in tracks:
        out.extend(t)
    return out


def normalise(samples, peak=0.85):
    if not samples:
        return samples
    m = max(abs(s) for s in samples) or 1.0
    k = peak / m
    return [s * k for s in samples]


def freq_sweep(f0, f1, duration, amp=1.0):
    """Linear frequency sweep — useful for blips and impacts."""
    n = int(SAMPLE_RATE * duration)
    out = [0.0] * n
    phase = 0.0
    for i in range(n):
        t = i / n
        f = f0 + (f1 - f0) * t
        phase += 2 * math.pi * f / SAMPLE_RATE
        out[i] = amp * math.sin(phase)
    return out


def write_wav(path, samples):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    samples = normalise(samples)
    with wave.open(path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SAMPLE_RATE)
        frames = bytearray()
        for s in samples:
            v = max(-1.0, min(1.0, s))
            frames.extend(struct.pack('<h', int(v * 32767)))
        w.writeframes(bytes(frames))
    print(f'  wrote {path}  ({len(samples)/SAMPLE_RATE:.2f}s)')


# ----------------------------------------------------------------------
# Sound effect recipes
# ----------------------------------------------------------------------
def make_click():
    s = freq_sweep(1800, 900, 0.05)
    return envelope(s, attack=0.001, decay=0.01, sustain=0.4, release=0.04)


def make_error():
    a = sine(440, 0.12)
    b = sine(220, 0.18)
    s = envelope(concat(a, b), attack=0.005, decay=0.02, sustain=0.7, release=0.08)
    return s


def make_villager_select():
    s = freq_sweep(700, 1200, 0.12)
    s = mix(s, gain(sine(900, 0.12), 0.4))
    return envelope(s, attack=0.005, decay=0.02, sustain=0.6, release=0.08)


def make_villager_move():
    s = freq_sweep(900, 1500, 0.1)
    return envelope(s, attack=0.003, decay=0.02, sustain=0.5, release=0.06)


def make_military_select():
    s = freq_sweep(420, 280, 0.15)
    s = mix(s, gain(square(150, 0.15), 0.2))
    return envelope(s, attack=0.005, decay=0.03, sustain=0.7, release=0.1)


def make_military_move():
    s = freq_sweep(380, 520, 0.12)
    s = mix(s, gain(noise(0.12), 0.1))
    return envelope(s, attack=0.005, decay=0.02, sustain=0.6, release=0.08)


def make_chop_wood():
    # Sharp transient + low body — like an axe biting into wood.
    transient = envelope(noise(0.04), attack=0.001, decay=0.02, sustain=0.0, release=0.02)
    body = envelope(sine(140, 0.18), attack=0.002, decay=0.05, sustain=0.4, release=0.13)
    return mix(gain(transient, 0.9), gain(body, 0.6))


def make_mine():
    # Metallic clang via two detuned sines + bright noise burst.
    a = envelope(sine(880, 0.25), attack=0.001, decay=0.05, sustain=0.5, release=0.18)
    b = envelope(sine(1320, 0.25), attack=0.001, decay=0.05, sustain=0.4, release=0.18)
    c = envelope(noise(0.05), attack=0.001, decay=0.02, sustain=0.0, release=0.02)
    return mix(gain(a, 0.5), gain(b, 0.4), gain(c, 0.6))


def make_forage():
    # Soft leafy rustle.
    s = envelope(noise(0.18), attack=0.01, decay=0.04, sustain=0.6, release=0.12)
    return gain(s, 0.6)


def make_build():
    # Hammer thuds: three percussive transients in sequence.
    out = []
    for i in range(3):
        thud = mix(
            gain(envelope(noise(0.05), 0.001, 0.02, 0.0, 0.02), 0.7),
            gain(envelope(sine(180, 0.12), 0.002, 0.04, 0.4, 0.08), 0.5),
        )
        out = concat(out, thud, silence(0.06))
    return out


def make_attack():
    # Metallic clash — bright noise + ringing sine.
    transient = envelope(noise(0.08), attack=0.001, decay=0.02, sustain=0.0, release=0.06)
    ring1 = envelope(sine(1100, 0.3), attack=0.001, decay=0.05, sustain=0.5, release=0.24)
    ring2 = envelope(sine(1700, 0.3), attack=0.001, decay=0.05, sustain=0.4, release=0.24)
    return mix(gain(transient, 0.8), gain(ring1, 0.4), gain(ring2, 0.3))


def make_building_complete():
    # Ascending major triad — feel-good completion chime.
    notes = [523.25, 659.25, 783.99]  # C5, E5, G5
    out = []
    for f in notes:
        n = envelope(sine(f, 0.18), attack=0.005, decay=0.03, sustain=0.7, release=0.12)
        out = concat(out, n)
    # Final chord ringing out.
    chord = mix(*[envelope(sine(f, 0.5), 0.005, 0.05, 0.6, 0.4) for f in notes])
    out = concat(out, gain(chord, 0.7))
    return out


def make_building_destroy():
    # Noisy crumble with falling pitch.
    body = envelope(noise(0.6), attack=0.005, decay=0.1, sustain=0.5, release=0.4)
    rumble = freq_sweep(220, 60, 0.6)
    rumble = envelope(rumble, attack=0.01, decay=0.1, sustain=0.6, release=0.4)
    return mix(gain(body, 0.6), gain(rumble, 0.5))


# ----------------------------------------------------------------------
# Music — short loopable beds
# ----------------------------------------------------------------------
def make_music_peace():
    """Calm 4-bar ambient pad in C major, ~6 seconds, loopable."""
    bar_seconds = 1.5
    chords = [
        [261.63, 329.63, 392.00],  # C major
        [220.00, 261.63, 329.63],  # A minor
        [293.66, 349.23, 440.00],  # D minor
        [196.00, 246.94, 293.66],  # G major
    ]
    out = []
    for chord in chords:
        layers = []
        for f in chord:
            tone = sine(f, bar_seconds, amp=0.25)
            tone = envelope(tone, attack=0.4, decay=0.2, sustain=0.6, release=0.4)
            layers.append(tone)
            # Add a soft octave below for warmth.
            sub = sine(f / 2, bar_seconds, amp=0.12)
            sub = envelope(sub, attack=0.4, decay=0.2, sustain=0.5, release=0.4)
            layers.append(sub)
        out = concat(out, mix(*layers))
    return gain(out, 0.7)


def make_music_battle():
    """Driving drum-and-low-brass loop, ~4 seconds, loopable."""
    beat = 0.25  # 240 BPM
    bars = 4
    out = []
    for i in range(bars * 4):
        layers = []
        # Kick on every beat.
        kick = mix(
            gain(envelope(sine(60, beat), 0.001, 0.05, 0.2, 0.18), 0.9),
            gain(envelope(noise(0.04), 0.001, 0.02, 0.0, 0.02), 0.4),
        )
        layers.append(kick)
        # Snare on backbeats.
        if i % 2 == 1:
            snare = envelope(noise(beat), 0.001, 0.04, 0.3, beat - 0.05)
            layers.append(gain(snare, 0.5))
        # Brass stab every fourth beat.
        if i % 4 == 0:
            brass = mix(
                envelope(square(110, beat), 0.005, 0.05, 0.7, beat - 0.06),
                envelope(square(165, beat), 0.005, 0.05, 0.5, beat - 0.06),
            )
            layers.append(gain(brass, 0.4))
        out = concat(out, mix(*layers))
    return gain(out, 0.75)


# ----------------------------------------------------------------------
# Manifest
# ----------------------------------------------------------------------
RECIPES = {
    'ui/click.wav': make_click,
    'ui/error.wav': make_error,
    'units/villager_select.wav': make_villager_select,
    'units/villager_move.wav': make_villager_move,
    'units/military_select.wav': make_military_select,
    'units/military_move.wav': make_military_move,
    'actions/chop.wav': make_chop_wood,
    'actions/mine.wav': make_mine,
    'actions/forage.wav': make_forage,
    'actions/build.wav': make_build,
    'actions/attack.wav': make_attack,
    'buildings/complete.wav': make_building_complete,
    'buildings/destroy.wav': make_building_destroy,
    'music/peace.wav': make_music_peace,
    'music/battle.wav': make_music_battle,
}


def main():
    random.seed(42)  # deterministic builds
    print(f'[generate_sounds] writing {len(RECIPES)} files into {OUT_ROOT}')
    for rel, fn in RECIPES.items():
        write_wav(os.path.join(OUT_ROOT, rel), fn())
    print('[generate_sounds] done.')


if __name__ == '__main__':
    main()
