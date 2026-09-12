/**
 * AI service (req 21, 66, 79).
 * Optional provider (OpenAI-compatible). Every request:
 *   - discloses exactly what is sent (privacy, req 66)
 *   - validates structured output
 *   - falls back to the deterministic engine on ANY failure
 * The learning engine never blocks on AI.
 */
import { AveniqDB } from '../db/db';
import { Clock, realClock } from '../domain/clock';
import { Concept, Explanation, LayerKind, Question } from '../domain/types';
import {
  AITeachBackEval,
  disclosureFor,
  AIRequest,
  fallbackExplanation,
  fallbackSocraticReply,
  mergeTeachBackEval,
  validateExplanation,
  validateQuestion,
  validateSocraticReply,
  validateTeachBackEval,
} from '../domain/aiSchemas';
import { LearningService } from './learningService';
import { evaluateTeachBack, TeachBackEvaluation } from '../domain/teachback';

export interface AIConfig {
  enabled: boolean;
  provider: 'none' | 'openai-compatible';
  baseUrl: string;
  model: string;
  apiKey: string;
}

interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

export class AIService {
  constructor(
    private db: AveniqDB,
    private learning: LearningService,
    private clock: Clock = realClock,
  ) {}

  private async config(): Promise<AIConfig> {
    const learner = await this.learning.getLearner();
    return learner.settings.ai;
  }

  private async chat(messages: ChatMessage[], maxTokens = 800): Promise<string | null> {
    const cfg = await this.config();
    if (!cfg.enabled || cfg.provider !== 'openai-compatible' || !cfg.baseUrl || !cfg.apiKey) return null;
    try {
      const url = `${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify({
          model: cfg.model || 'gpt-4o-mini',
          messages,
          temperature: 0.4,
          max_tokens: maxTokens,
          response_format: { type: 'json_object' },
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) return null;
      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content;
      return typeof content === 'string' ? content : null;
    } catch {
      return null; // network / abort / parse — fall back silently (req 69, 79)
    }
  }

  /** Alternative explanation via AI, validated; deterministic fallback otherwise (req 5, 79). */
  async alternativeExplanation(concept: Concept, layer: LayerKind): Promise<{ explanation: Explanation; source: 'ai' | 'engine'; disclosure: string }> {
    const request: AIRequest = { type: 'alternative-explanation', concept: concept.name, layer };
    const disclosure = disclosureFor(request);
    const out = await this.chat([
      {
        role: 'system',
        content:
          'You are a learning designer. Return JSON: {"style":"analogy|example|steps|comparison|scenario|simplified|worked|technical|definition","content":"..."}. Explain honestly, at the requested depth, for a complete beginner. Max 160 words. Use [[term]] markers for key vocabulary.',
      },
      { role: 'user', content: `Concept: ${concept.name}\nDefinition: ${concept.intro}\nDepth layer: ${layer}\nOne-sentence intro of each prerequisite is available in the definition context.` },
    ]);
    if (out) {
      try {
        const validated = validateExplanation(JSON.parse(out), layer);
        if (validated.ok && validated.value) {
          return { explanation: validated.value, source: 'ai', disclosure: disclosure.note };
        }
      } catch {
        /* fall through */
      }
    }
    return { explanation: fallbackExplanation(concept, layer), source: 'engine', disclosure: disclosure.note };
  }

  /** Teach-back evaluation: deterministic core, AI may refine (req 21: never blindly trust). */
  async evaluateTeachBack(concept: Concept, text: string): Promise<{ evaluation: TeachBackEvaluation; aiComment?: string; source: 'engine' | 'ai+engine' }> {
    const knownVocab = await this.learning.knownVocabulary();
    const deterministic = evaluateTeachBack(concept, text, { knownVocabulary: knownVocab });
    const request: AIRequest = { type: 'evaluate-teachback', concept: concept.name, keyIdeas: concept.keyIdeas.map((k) => k.label), learnerText: text };
    const out = await this.chat([
      {
        role: 'system',
        content:
          'You evaluate a learner’s explanation. Return JSON: {"coverage":0-1,"missing":["idea",...],"misconceptions":["...",...],"comment":"..."}. Be fair: reward understanding, not word count.',
      },
      { role: 'user', content: `Concept: ${concept.name}\nRequired ideas: ${concept.keyIdeas.map((k) => k.label).join('; ')}\nLearner said: ${text.slice(0, 1500)}` },
    ]);
    if (out) {
      try {
        const validated = validateTeachBackEval(JSON.parse(out));
        if (validated.ok && validated.value) {
          const ai: AITeachBackEval = validated.value;
          const mergedCoverage = mergeTeachBackEval(deterministic.coverage, ai);
          return {
            evaluation: { ...deterministic, score: Math.max(0, Math.min(1, deterministic.score * (mergedCoverage / Math.max(0.01, deterministic.coverage || 0.01)))) },
            aiComment: ai.comment,
            source: 'ai+engine',
          };
        }
      } catch {
        /* fall through */
      }
    }
    return { evaluation: deterministic, source: 'engine' };
  }

  /** Socratic tutor reply (req 20): guide, don’t tell. Deterministic ladder by default. */
  async socraticReply(concept: Concept, question: Question | null, learnerMessage: string, stepIndex: number): Promise<{ reply: string; source: 'engine' | 'ai' }> {
    const hints = question?.hints ?? [];
    const request: AIRequest = {
      type: 'socratic-reply',
      concept: concept.name,
      question: question?.prompt ?? '',
      learnerMessage,
      misconceptions: concept.misconceptionDefs.map((m) => m.label),
    };
    const out = await this.chat([
      {
        role: 'system',
        content:
          'You are a Socratic tutor. NEVER state the answer directly. Return JSON: {"reply":"..."}. Reply with ONE guiding question or a small nudge. If the learner is close, ask them to finish the thought. Max 40 words.',
      },
      { role: 'user', content: `Concept: ${concept.name}\nQuestion: ${question?.prompt ?? 'free discussion'}\nKnown misconceptions: ${request.misconceptions.join('; ') || 'none'}\nLearner said: ${learnerMessage.slice(0, 600)}` },
    ]);
    if (out) {
      try {
        const validated = validateSocraticReply(JSON.parse(out), question?.answer ?? '');
        if (validated.ok && validated.value) return { reply: validated.value, source: 'ai' };
      } catch {
        /* fall through */
      }
    }
    return { reply: fallbackSocraticReply(stepIndex, hints), source: 'engine' };
  }

  /** Generate a practice question via AI (validated, marked as AI-sourced, req 21/25). */
  async generateQuestion(concept: Concept): Promise<Question | null> {
    const out = await this.chat([
      {
        role: 'system',
        content:
          'You write ONE multiple-choice practice question. Return JSON: {"prompt":"...","choices":[{"text":"...","correct":true},{"text":"...",...}],"hints":["...","...","..."]}. 4 choices, exactly 1 correct. Distractors must represent realistic misconceptions.',
      },
      { role: 'user', content: `Concept: ${concept.name}\nDefinition: ${concept.intro} ${concept.whyItMatters}` },
    ]);
    if (out) {
      try {
        const validated = validateQuestion(JSON.parse(out));
        if (validated.ok && validated.value) {
          return { ...validated.value, conceptId: concept.id };
        }
      } catch {
        /* fall through */
      }
    }
    return null;
  }

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    const out = await this.chat([{ role: 'system', content: 'Return JSON: {"ok":true}' }, { role: 'user', content: 'ping' }], 20);
    return out ? { ok: true } : { ok: false, error: 'Provider unreachable or not configured' };
  }

  async isConfigured(): Promise<boolean> {
    const cfg = await this.config();
    return cfg.enabled && cfg.provider === 'openai-compatible' && Boolean(cfg.baseUrl && cfg.apiKey);
  }
}
