import type { QuizDetail } from "./contract"

// Development only (/career/quizzes/fixture?fixture=1 outside production): one quiz with every question type, so each
// renderer can be checked without the API. New wording in the format of a company's work-simulation test.

export const FIXTURE_QUIZ: QuizDetail = {
  id: "fixture",
  title: "Northwind · Operations Associate",
  company: "Northwind",
  role: "Operations Associate",
  status: "ready",
  stage: null,
  questionCount: 9,
  minutes: 14,
  bestScore: null,
  attempts: 0,
  history: [],
  createdAt: new Date().toISOString(),
  about:
    "Northwind's online assessment for operations roles has three parts: a work simulation with messages from colleagues, a work-style questionnaire, and a short reasoning section. This practice quiz follows the same format.",
  sources: [{ title: "Example source", url: "https://example.com" }],
  sections: [
    {
      id: "s1",
      kind: "work_simulation",
      title: "Work Simulation",
      instructions: "Read each message and the information under it, then answer as you would on the job. The extra time each response needs is in brackets.",
      timeLimitSec: 600,
      scenarios: [
        {
          id: "sc1",
          title: "A teammate asks for urgent help",
          context: [
            {
              kind: "message",
              from: "Leila Haddad",
              role: "Team lead",
              body: "Hi,\nOur shift is short one person and three customer returns need to be processed before 4 pm. Could you help with some of them today?\nThanks,\nLeila",
            },
            {
              kind: "table",
              caption: "Your day so far",
              columns: ["Activity", "Hours", "Impact", "Priority"],
              rows: [
                ["Weekly stock report", "2", "High", "High"],
                ["Supplier call", "1", "Moderate", "Moderate"],
                ["Process customer returns", "1.5", "High", "High"],
              ],
              legend: "Low / Moderate / High amount.",
            },
          ],
          task: "You can work 8 hours today. Based on your work and the new request, consider which action you would take.",
        },
        {
          id: "sc2",
          title: "Choosing a delivery partner",
          context: [
            {
              kind: "message",
              from: "Omar Saleh",
              role: "Logistics manager",
              body: "We need a partner that keeps deliveries on time while costs stay low. Can you rank the four candidates?",
            },
            {
              kind: "table",
              columns: ["Partner", "On-time rate", "Cost", "Complaints"],
              rows: [
                ["Atlas", "High", "Moderate", "Low"],
                ["Brio", "Moderate", "Low", "Moderate"],
                ["Cora", "High", "High", "Low"],
                ["Delta", "Low", "Low", "High"],
              ],
            },
          ],
          task: "Rank the partners, keeping the team's goals in mind.",
        },
      ],
      questions: [
        {
          id: "q1",
          type: "rating",
          scenarioId: "sc1",
          prompt: "How effective is it to process the returns first, then finish your report? (1.5 hours)",
          scale: { min: 1, max: 4, minLabel: "Ineffective", maxLabel: "Highly effective" },
        },
        {
          id: "q2",
          type: "rating",
          scenarioId: "sc1",
          prompt: "How effective is it to decline and keep to your plan? (0 hours)",
          scale: { min: 1, max: 4, minLabel: "Ineffective", maxLabel: "Highly effective" },
        },
        {
          id: "q3",
          type: "ranking",
          scenarioId: "sc2",
          prompt: "Rank the delivery partners.",
          items: [
            { id: "atlas", text: "Atlas" },
            { id: "brio", text: "Brio" },
            { id: "cora", text: "Cora" },
            { id: "delta", text: "Delta" },
          ],
        },
      ],
    },
    {
      id: "s2",
      kind: "work_style",
      title: "Work Style",
      instructions: "For each pair, choose the statement that describes you better and how strongly. There are no right or wrong answers.",
      timeLimitSec: null,
      scenarios: [],
      questions: [
        { id: "q4", type: "work_style", left: "I finish what I start, even when it gets dull.", right: "I like to change how I work from week to week." },
        { id: "q5", type: "work_style", left: "I notice small errors others miss.", right: "I pick up on how my teammates are feeling." },
      ],
    },
    {
      id: "s3",
      kind: "logical",
      title: "Reasoning",
      instructions: "Answer each question. Some include a chart or a pattern.",
      timeLimitSec: 300,
      scenarios: [],
      questions: [
        {
          id: "q6",
          type: "single_choice",
          prompt: "Orders grew from 80 to 100 thousand. By what percentage did they grow?",
          media: [{ kind: "chart", title: "Orders (thousands)", chart: "bar", labels: ["Jan", "Feb", "Mar"], series: [{ name: "Orders", values: [80, 85, 100] }] }],
          choices: [
            { id: "a", text: "20%" },
            { id: "b", text: "25%" },
            { id: "c", text: "15%" },
            { id: "d", text: "30%" },
          ],
        },
        {
          id: "q7",
          type: "multi_choice",
          prompt: "Which two metrics would most likely raise customer complaints?",
          pick: 2,
          choices: [
            { id: "a", text: "Late shipments" },
            { id: "b", text: "Wrong items shipped" },
            { id: "c", text: "More discounts" },
            { id: "d", text: "A new logo" },
          ],
        },
        {
          id: "q8",
          type: "pattern",
          prompt: "Which figure comes next?",
          sequence: [
            { shapes: [{ shape: "triangle", x: 50, y: 50, size: 40, rotation: 0, fill: "none" }] },
            { shapes: [{ shape: "triangle", x: 50, y: 50, size: 40, rotation: 90, fill: "striped" }] },
            { shapes: [{ shape: "triangle", x: 50, y: 50, size: 40, rotation: 180, fill: "solid" }] },
          ],
          choices: [
            { id: "a", figure: { shapes: [{ shape: "triangle", x: 50, y: 50, size: 40, rotation: 270, fill: "none" }] } },
            { id: "b", figure: { shapes: [{ shape: "square", x: 50, y: 50, size: 40, fill: "dotted" }] } },
            { id: "c", figure: { shapes: [{ shape: "triangle", x: 50, y: 50, size: 40, rotation: 0, fill: "solid" }] } },
            {
              id: "d",
              figure: {
                shapes: [
                  { shape: "star", x: 50, y: 50, size: 44, fill: "none" },
                  { shape: "circle", x: 50, y: 50, size: 10, fill: "solid" },
                ],
              },
            },
          ],
        },
        {
          id: "q9",
          type: "single_choice",
          prompt: "Which line is trending down?",
          media: [
            {
              kind: "chart",
              title: "Weekly metrics",
              chart: "line",
              labels: ["W1", "W2", "W3", "W4"],
              series: [
                { name: "On-time %", values: [92, 90, 87, 84] },
                { name: "Orders", values: [70, 74, 79, 83] },
              ],
            },
          ],
          choices: [
            { id: "a", text: "On-time %" },
            { id: "b", text: "Orders" },
          ],
        },
      ],
    },
  ],
}
