/** Retry amplification arithmetic: what the bottom layer sees when every layer retries. */

/** each of `layers` layers makes `attempts` total tries (1 try + attempts-1 retries) → bottom sees attempts^layers */
export const bottomLoad = (layers: number, attempts: number) => attempts ** layers

/** "retry N times" means N+1 attempts */
export const attemptsFromRetries = (retries: number) => retries + 1

/** worst-case multiplier when retries are capped at `ratio` of requests (e.g. 0.1 → 1.1×) */
export const budgetCap = (ratio: number) => 1 + ratio
