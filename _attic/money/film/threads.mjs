// ffmpeg gets every core but two, so a render never makes the machine unusable.
// Minimum 1, because a 2-core box still has to be able to encode.
import os from 'node:os';

export const CORES = os.cpus().length;
export const THREADS = Math.max(1, CORES - 2);

/** ffmpeg args that apply the cap to both decoding and encoding. */
export const cap = () => ['-threads', String(THREADS)];
