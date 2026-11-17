import type { Lesson } from './lesson'

// The public demo lesson at /demo. Written by hand so anyone can try Lyceo
// without an account; audio is generated once and then served from the cache.
export const DEMO_LESSON: Lesson = {
  title: "Bayes' theorem: why a positive test can still mean you're probably fine",
  estimatedMinutes: 6,
  meta: { version: 2, kind: 'lesson' },
  segments: [
    {
      concept: 'Conditional probability',
      narration:
        "Hey, I'm Theo. Today we're cracking one of the most useful ideas in statistics, and at the end there's a puzzle that fools most doctors. First, conditional probability. The probability of A given B means: out of all the times B happens, how often does A happen too? Look at the board. Say fifty students in a dorm take stats, and twenty of those fifty also play a varsity sport. If you pick a random stats student, the chance they're an athlete is twenty out of fifty, or zero point four. The word given just means: shrink your world down to B, and count inside it.",
      board: [
        'Given B = shrink your world to B',
        '$$P(A \\mid B) = \\frac{P(A \\cap B)}{P(B)}$$',
        '50 take stats, 20 of them play a sport',
        '$P(\\text{sport} \\mid \\text{stats}) = 20/50 = 0.4$',
      ],
      check: {
        question:
          'In the same dorm, 40 students play a sport and 10 of those athletes take stats. Given that a student plays a sport, what is the probability they take stats?',
        idealAnswer: '10/40 = 0.25',
      },
    },
    {
      concept: 'Order matters',
      narration:
        "Here's the trap. The probability of A given B is usually not the probability of B given A. Think about basketball. If someone plays in the NBA, the chance they're taller than six foot three is close to one. But if someone is taller than six foot three, the chance they play in the NBA is tiny, because there are millions of tall people and only a few hundred NBA players. Same two events, completely different numbers, because the denominator changed. Keep that in your back pocket, because the puzzle coming up is exactly this mistake.",
      board: [
        '$P(\\text{tall} \\mid \\text{NBA}) \\approx 1$',
        '$P(\\text{NBA} \\mid \\text{tall}) \\approx 0$',
        'Flip the condition, change the denominator',
      ],
      check: {
        question:
          'Is the probability of rain given clouds the same as the probability of clouds given rain? Why or why not?',
        idealAnswer:
          'No. Clouds given rain is close to 1, but rain given clouds is lower because many cloudy days stay dry. The denominators are different.',
      },
    },
    {
      concept: "Bayes' theorem",
      narration:
        "So how do you flip a conditional the right way? That's Bayes' theorem. The probability of A given B equals the probability of B given A, times the probability of A, all divided by the probability of B. Each piece has a name. The probability of A is the prior: what you believed before seeing any evidence. The probability of B given A is the likelihood: how expected the evidence is if A is true. And the result, A given B, is the posterior: your updated belief after the evidence. Bayes is really a recipe for changing your mind by the right amount.",
      board: [
        '$$P(A \\mid B) = \\frac{P(B \\mid A)\\,P(A)}{P(B)}$$',
        '$P(A)$: prior, before the evidence',
        '$P(B \\mid A)$: likelihood',
        '$P(A \\mid B)$: posterior, after the evidence',
      ],
      check: {
        question: "In Bayes' theorem, what do we call P(A), the belief you hold before seeing any evidence?",
        idealAnswer: 'The prior.',
      },
    },
    {
      concept: 'The medical test puzzle',
      narration:
        "Now the puzzle. A disease affects one percent of people. A test catches it ninety-five percent of the time when you have it, but it also flags ten percent of healthy people by mistake. You test positive. What's the chance you're actually sick? Most people say about ninety-five percent. Let's count instead. Picture a thousand people. Ten are sick, and about nine and a half of them test positive. Nine hundred ninety are healthy, and ten percent of them, ninety-nine people, also test positive. So out of about a hundred and nine positive tests, only nine and a half are real. That's under nine percent.",
      board: [
        '1,000 people: 10 sick, 990 healthy',
        'True positives: $0.95 \\times 10 = 9.5$',
        'False positives: $0.10 \\times 990 = 99$',
        '$$P(\\text{sick} \\mid +) = \\frac{9.5}{9.5 + 99} \\approx 8.8\\%$$',
      ],
      check: {
        question:
          'Using the board, roughly what is the chance that someone who tests positive is actually sick: about 95%, about 50%, or under 10%?',
        idealAnswer: 'Under 10%, about 8.8%.',
      },
    },
    {
      concept: 'Why base rates win',
      narration:
        "Why did the test do so badly? Because the disease is rare. The prior, one percent, is so small that the healthy crowd is huge, and even a small false positive rate on a huge crowd swamps the real cases. This is called base rate neglect, and it shows up everywhere: spam filters, fraud alerts, airport security. The fix is always the same. Before you trust the evidence, ask how common the thing was to begin with. And if you test positive, test again. A second independent positive pushes the chance up to almost fifty percent, because now your prior isn't one percent anymore.",
      board: [
        'Rare event + noisy test = mostly false alarms',
        'Base rate neglect: ignoring $P(A)$',
        'Second test: new prior $\\approx 8.8\\%$',
      ],
      check: {
        question:
          'If the disease affected 20% of people instead of 1%, would a positive test be more or less convincing? Why?',
        idealAnswer:
          'More convincing. A higher prior means true positives make up a bigger share of all the positive tests.',
      },
    },
  ],
}
