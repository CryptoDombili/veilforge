interface ScoreRingProps {
  score: number;
  grade: string;
}

export function ScoreRing({ score, grade }: ScoreRingProps): React.JSX.Element {
  const riskLabel = score >= 90 ? 'Ready' : score >= 75 ? 'Review' : score >= 55 ? 'Exposed' : 'Critical';
  return (
    <div className="score-cluster">
      <div className="score-ring" style={{ '--score': `${score * 3.6}deg` } as React.CSSProperties}>
        <div className="score-inner"><strong>{score}</strong><span>/100</span></div>
      </div>
      <div className="score-copy"><span className={`grade grade-${grade.toLowerCase()}`}>{grade}</span><div><strong>{riskLabel}</strong><p>Privacy readiness</p></div></div>
    </div>
  );
}
