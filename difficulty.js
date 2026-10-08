export const difficultyLabels = { easy: "Лёгкое", medium: "Среднее", hard: "Сложное" };

export function difficultyLevel(value) {
  if (Object.hasOwn(difficultyLabels, value)) return value;
  return Number(value) <= 2 ? "easy" : Number(value) === 3 ? "medium" : "hard";
}
