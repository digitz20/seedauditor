import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';
import './flows/random-seed-phrase';

export const ai = genkit({
  plugins: [googleAI()],
  model: 'googleai/gemini-2.0-flash',
});

