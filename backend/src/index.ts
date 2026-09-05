import { createApp } from './app.js';
import { describeLlmConfig, llmConfig } from './llm/config.js';

const port = Number(process.env.PORT ?? 4000);

// Logged once at boot so a reviewer can see which mode is active and whether a
// key was supplied — without the key ever being printed (design §5.1).
console.log(describeLlmConfig(llmConfig));

createApp().listen(port, () => {
  console.log(`backend listening on port ${port}`);
});
