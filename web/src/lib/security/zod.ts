import { z } from 'zod';

// Zod would probe `new Function` to compile faster parsers; under the CSP (no 'unsafe-eval') that probe is reported as a violation even though it is caught.
z.config({ jitless: true });
