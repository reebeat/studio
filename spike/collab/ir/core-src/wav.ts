// A clip of float samples as the bytes of a WAV file: RIFF, 16-bit PCM, one channel. The Deck's `sfx` step fetches
// `assets/sfx/<name>.wav`, so the pipeline writes each sound it plays through this. Pure and total: every sample is
// clamped to [-1, 1] and rounded to the nearest 16-bit step, so equal clips give equal bytes.

/** What a WAV file needs of a clip: mono samples in [-1, 1] and their rate in Hz. */
interface WavClip {
  readonly sampleRate: number;
  readonly samples: Float32Array;
}

/** The size of the RIFF, `fmt ` and `data` headers. */
const headerBytes = 44;

/** The largest 16-bit sample. */
const fullScale = 32_767;

const bytesPerSample = 2;

/** `clip` as a 16-bit PCM mono WAV file: a 44-byte header, then the little-endian samples. */
export const audioClipToWav = (clip: WavClip): Uint8Array => {
  const dataBytes = clip.samples.length * bytesPerSample;
  const bytes = new Uint8Array(headerBytes + dataBytes);
  const view = new DataView(bytes.buffer);

  // The tags are ASCII, so each character is one byte.
  const tag = (offset: number, text: string): void => {
    bytes.set(new TextEncoder().encode(text), offset);
  };

  tag(0, "RIFF");
  view.setUint32(4, headerBytes - 8 + dataBytes, true);
  tag(8, "WAVE");
  tag(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, clip.sampleRate, true);
  view.setUint32(28, clip.sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  tag(36, "data");
  view.setUint32(40, dataBytes, true);

  for (const [index, sample] of clip.samples.entries()) {
    view.setInt16(
      headerBytes + index * bytesPerSample,
      Math.round(Math.max(-1, Math.min(1, sample)) * fullScale),
      true
    );
  }

  return bytes;
};
