import type { ColorName, EvaluationScore, ViewMode } from "./types";

export const uiGlossary = {
  product: {
    eyebrow: "체스 학습 도우미",
    title: "두면서 배우는 실시간 코치",
    shellDescription:
      "백엔드가 보드를 기준으로 상태를 관리하고, 수를 둘 때마다 피드백을 받은 뒤 복기와 약점 요약으로 자연스럽게 이어집니다.",
  },
  views: {
    live: "실시간 대국",
    review: "복기",
    archive: "저장된 대국 다시보기",
    weakness: "반복 약점 요약",
  } satisfies Record<ViewMode, string>,
  concepts: {
    candidateMoves: "후보 수",
    recommendedMoves: "추천 수",
    moveQuality: "수 평가",
    nextStudyFocus: "다음 학습 포인트",
    reviewContext: "복기 맥락",
    replay: "수순 다시보기",
    savedGames: "저장된 대국",
    liveBoard: "학습 보드",
    check: "체크",
    lastMove: "마지막 수",
  },
  buttons: {
    refresh: "새로고침",
    openReview: "복기 열기",
    openReviewSummary: "복기 보기",
    openSavedGames: "저장된 대국 보기",
    openWeakness: "반복 약점 보기",
    createGame: "새 대국",
    startReplay: "수순 다시보기",
    replayFirst: "처음",
    replayPrevious: "이전",
    replayNext: "다음",
    replayLast: "마지막",
    jumpToMoment: "이 장면으로 이동",
    openWeaknessFromReplay: "반복 약점 보기",
    openExampleReplay: "대표 사례 보기",
    openRelatedReplay: "관련 복기 열기",
    selectWeakness: "이 약점 자세히 보기",
    preparingReview: "복기 준비 중",
  },
  sections: {
    workspace: "작업 영역",
    currentScreen: "현재 화면",
    currentStatus: "현재 상태",
    liveSyncSummary: "실시간 동기화 요약",
    resume: "이어하기",
    savedInProgressGames: "저장된 진행 중 대국",
    immediateFeedback: "즉시 피드백",
    currentGuidance: "현재 국면 가이드",
    analysisDetails: "분석 상세",
    afterGame: "대국 종료 후",
    importantMistakes: "중요한 실수",
    goodMoves: "좋았던 수",
    turningPoints: "흐름이 바뀐 순간",
    selectedMove: "선택한 수",
    importantMoments: "중요한 장면",
    currentLearningFocus: "현재 수 학습 포인트",
    whyItMatters: "왜 중요한지",
    nextToStudy: "다음에 볼 것",
    selectedPattern: "선택한 패턴",
    topPriorityWeakness: "지금 가장 먼저 볼 약점",
    recentWeakness: "최근 다시 나온 약점",
    recommendedAction: "바로 할 학습 행동",
    weaknessSummary: "약점 요약",
    relatedGames: "관련 대국",
    futureTools: "이후 확장 영역",
  },
  labels: {
    turn: "차례",
    progressMoves: "진행 수",
    analysis: "분석",
    review: "복기",
    availableMoves: "가능한 수",
    bestMoveGap: "최선 수와 차이",
    nextPlan: "다음 계획",
    evaluation: "평가값",
    bestMove: "최선 수",
    beforeFen: "수 두기 전 FEN",
    afterFen: "수 둔 뒤 FEN",
    userMove: "사용자가 둔 수",
    shortCoachingNote: "짧은 코칭 메모",
    oneLinePlan: "한 줄 계획",
    representativeLine: "대표 진행",
    replayProgress: "복기 진행",
    currentMoment: "현재 장면",
    moveMeaning: "이번 수에서 바로 볼 점",
    patterns: "패턴",
    recentSeen: "최근 발생",
    frequency: "발생 빈도",
    actionPriority: "우선도",
    availableExample: "대표 사례",
  },
  board: {
    ariaLabel: "체스판",
    emptySquare: "빈칸",
  },
  placeholder: {
    futureTools:
      "패턴별 훈련 문제나 더 풍부한 모티프 설명은 아직 자리만 준비된 상태입니다. 현재 대시보드는 저장된 규칙 기반 태그만 사용합니다.",
  },
} as const;

export const uiStatusText = {
  ready: "준비됨",
  unavailable: "없음",
  waiting: "대기 중",
  saved: "저장됨",
  preparing: "준비 중",
  noData: "데이터 없음",
  startPosition: "시작 포지션",
  selectionCleared: "선택을 해제했습니다.",
  stalemate: "스테일메이트입니다.",
  loading: {
    newGame: "새 대국을 준비하는 중입니다...",
    archiveList: "저장된 대국 목록을 불러오는 중입니다...",
    resumeList: "이어할 대국 목록을 불러오는 중입니다...",
    weaknessSummary: "반복 약점 요약을 불러오는 중입니다...",
    openingArchive: "저장된 대국을 여는 중입니다...",
    resumingGame: "저장된 대국을 이어오는 중입니다...",
  },
  success: {
    newGameReady: "대국 준비가 끝났습니다. 백 차례입니다.",
    archiveListLoaded: "저장된 대국 목록을 불러왔습니다.",
    resumableListLoaded: "이어할 수 있는 대국을 불러왔습니다.",
    weaknessLoaded: "반복 약점 요약을 불러왔습니다.",
    archiveOpened: (gameId: string) => `${gameId} 대국을 다시보기로 열었습니다.`,
    gameResumed: (gameId: string) => `${gameId} 대국을 이어왔습니다.`,
    gameResumedWithTurn: (gameId: string, turnText: string) => `${gameId} 대국을 이어왔습니다. ${turnText}입니다.`,
  },
  empty: {
    archiveList: "저장된 대국이 아직 없습니다.",
    resumableList: "저장된 진행 중 대국이 아직 없습니다.",
    weaknessPatterns: "반복 약점 패턴이 아직 없습니다.",
    noResumableGames: "이어할 수 있는 대국이 없습니다.",
    noReplayMoves: "표시할 수순이 아직 없습니다.",
    noStoredCandidates: "선택한 수에 저장된 상위 후보 수가 이곳에 표시됩니다.",
    noReplayHighlight: "이 수순에는 별도 복기 하이라이트가 없습니다. 더 큰 흐름은 복기 화면에서 함께 보세요.",
    noImportantMoments: "이 대국에 저장된 주요 장면 표식은 아직 없습니다.",
    noLinkedArchives: "이 패턴에 연결된 저장 대국은 아직 없습니다.",
    noReviewYet: "아직 완료된 복기가 없습니다",
    noReviewBody: "먼저 한 판을 끝내거나, 이미 저장된 대국을 열어 복기 요약을 확인해 보세요.",
    noWeaknessPatternsTitle: "아직 반복 패턴이 없습니다",
    noWeaknessPatternsBody: "현재 규칙 기반 추적기는 완료된 대국이 몇 판 쌓여야 반복 약점을 의미 있게 보여줄 수 있습니다.",
    noFeedbackYetTitle: "수를 기다리는 중입니다",
    noFeedbackYetBody: "합법적인 수가 반영되면 이곳에 수 평가와 짧은 설명이 나타납니다.",
    noGoodMoves: "이번 대국에서는 별도로 두드러진 좋은 수가 표시되지 않았습니다.",
    noTurningPoints: "큰 평가 변동으로 저장된 장면은 없었습니다.",
    noRecordedMistakesTitle: "큰 실수로 기록된 장면은 없습니다",
    noRecordedMistakesBody: "현재 기준에서는 치명적인 실수 구간이 따로 잡히지 않았습니다.",
    noSelectedMove: "수순을 하나 선택하면 그 순간의 FEN과 코칭 정보를 함께 볼 수 있습니다.",
    noStoredNote: "저장된 짧은 메모가 없습니다.",
    noStoredPlan: "저장된 계획이 없습니다.",
    noStoredInfo: "저장된 정보가 없습니다",
    noStoredLine: "저장된 진행이 없습니다",
    noStudyFocus: "반복 약점이 쌓이면 이곳에 다음 학습 포인트가 나타납니다.",
    noSelectedPattern: "약점 카드를 하나 선택하면 설명과 추천 학습 방향을 자세히 볼 수 있습니다.",
    noActionableWeakness: "아직 바로 추천할 반복 약점이 없습니다.",
    noArchiveSelectedTitle: "왼쪽에서 대국을 선택하세요",
    noArchiveSelectedBody: "선택한 대국의 수순, 당시 피드백, 복기 맥락을 함께 살펴볼 수 있습니다.",
    replayReadySummary: "수순 다시보기를 할 수 있는 대국입니다.",
    storedReviewSummary: "이 대국의 복기 요약이 저장되어 있습니다.",
  },
  error: {
    createGame: "새 대국을 만들지 못했습니다.",
    loadArchiveList: "저장된 대국을 불러오지 못했습니다.",
    loadResumeList: "이어할 대국을 불러오지 못했습니다.",
    loadWeakness: "반복 약점 요약을 불러오지 못했습니다.",
    loadArchive: "저장된 대국을 불러오지 못했습니다.",
    resumeGame: "저장된 대국을 이어오지 못했습니다.",
    moveFailed: "수를 반영하지 못했습니다.",
    feedbackUnavailableTitle: "피드백을 불러오지 못했습니다",
    analysisUnavailableTitle: "분석을 불러오지 못했습니다",
  },
  placeholder: {
    reviewPreparing: "대국이 끝나면 이곳이 저장된 복기와 수순 다시보기로 넘어가는 입구가 됩니다.",
    reviewReady: "이 대국은 복기 요약이 준비되어 있습니다. 중요한 실수와 좋았던 수를 바로 다시 볼 수 있습니다.",
  },
} as const;

export const uiScreenText = {
  live: {
    title: uiGlossary.views.live,
    boardTitle: uiGlossary.concepts.liveBoard,
    feedbackTitle: "방금 둔 수를 이렇게 볼 수 있어요",
    guidanceTitle: "지금 먼저 볼 포인트",
    candidateOverlayTitle: "보드 오버레이 읽는 법",
    analysisDetailsTitle: "숫자는 보조 정보로 보기",
    reviewEntryTitle: "복기로 이어가기",
    syncPrinciple:
      "보드는 백엔드가 수를 검증한 뒤에만 바뀝니다. 분석이나 코칭이 실패해도 대국 자체는 계속 안정적으로 진행됩니다.",
    phaseGuidance: {
      opening:
        "처음 몇 수는 중앙 장악과 자연스러운 전개가 우선입니다. 초반부터 약점을 남기지 않는 수를 먼저 고르세요.",
      development:
        "중앙 쪽으로 기물을 전개하고, 옆쪽 폰을 건드리기 전에 안전한 캐슬링 계획이 있는지 먼저 보세요.",
      middlegame:
        "전술을 서두르기 전에 기물 협응을 먼저 점검하세요. 어느 쪽 킹이 더 안전한지, 중앙 돌파가 누구에게 쉬운지 살펴보면 좋습니다.",
      late:
        "추천 수는 방향만 보여줍니다. 왜 그 수가 좋은지, 즉 킹 안전과 느슨한 기물, 좋은 자리 싸움까지 함께 읽어보는 것이 중요합니다.",
    },
    analysisWaitingTitle: "추천 수를 준비하는 중입니다",
    analysisWaitingBody: "새 포지션 분석이 끝나면 상위 3개 후보 수가 보드와 패널에 함께 나타납니다.",
    analysisFallback:
      "이 영역은 보조 정보입니다. 분석이 늦거나 없더라도 먼저 피드백과 계획을 보는 흐름이 유지되도록 구성했습니다.",
    overlayHelper:
      "오버레이는 클릭을 가로채지 않도록 처리되어 있어 클릭 이동과 드래그 입력이 그대로 유지됩니다.",
  },
  review: {
    title: uiGlossary.views.review,
    resultSummaryTitle: uiGlossary.views.review,
    mistakesTitle: "가장 크게 흔들린 순간",
    goodMovesTitle: "다음에도 반복하고 싶은 선택",
    turningPointsTitle: "대국의 방향이 꺾인 장면",
    studyFocusTitle: "다음에 무엇을 볼지",
  },
  archive: {
    listTitle: "완료된 대국 목록",
    replayTitle: uiGlossary.concepts.replay,
    selectedMoveTitle: "당시 상황",
    candidateReviewTitle: "그때 더 좋았던 선택",
    reviewContextTitle: "학습 메모",
    moveListTitle: "수 목록",
    importantMomentsTitle: "중요한 장면 빠르게 보기",
    learningPanelTitle: "지금 이 수에서 배울 점",
    studyFocusTitle: "이 대국에서 다음에 집중할 것",
    replaySyncedBody:
      "선택한 수순에 저장된 포지션을 그대로 보여주므로, 보드와 당시 피드백 데이터가 어긋나지 않습니다.",
    replayStartBody:
      "시작 포지션을 불러왔습니다. 수순을 넘기면서 당시의 피드백과 추천 수를 함께 확인해 보세요.",
    moveListHelper:
      "중요한 실수, 좋았던 수, 흐름이 바뀐 순간은 수 목록과 빠른 이동 카드에서 함께 표시됩니다.",
  },
  weakness: {
    title: "자주 반복되는 학습 패턴",
    nextFocusTitle: "지금 집중할 것",
    selectedPatternTitle: "왜 중요한지",
    relatedGamesTitle: "다시보기로 바로 이동",
    futureToolsTitle: "학습 도구",
    topPriorityTitle: "먼저 잡아야 할 약점",
    recentTitle: "최근 다시 나타난 약점",
    actionTitle: "바로 해볼 학습 행동",
    cardHelper: "문제 진단보다 다음 행동이 먼저 보이도록 정리했습니다.",
    replayBridgeTitle: "대표 사례로 바로 복기",
  },
} as const;

const MOVE_QUALITY_LABELS: Record<string, string> = {
  Good: "좋은 수",
  Playable: "둘 만한 수",
  Inaccuracy: "아쉬운 수",
  Mistake: "실수",
  Blunder: "큰 실수",
};

const WEAKNESS_LABELS: Record<string, string> = {
  "Missed Tactical Chances": "전술 기회를 자주 놓침",
  "Delayed Castling": "캐슬링이 자주 늦어짐",
  "Delayed Piece Development": "기물 전개가 자주 늦어짐",
  "Repeated Pawn Structure Mistakes": "비슷한 폰 구조에서 실수가 반복됨",
};

export function viewLabel(viewMode: ViewMode): string {
  return uiGlossary.views[viewMode];
}

export function turnLabel(color: ColorName): string {
  return color === "white" ? "백" : "흑";
}

export function turnStatusLabel(color: ColorName): string {
  return `${turnLabel(color)} 차례`;
}

export function colorPerspectiveLabel(color: string): string {
  if (color === "white") {
    return "백 기준";
  }
  if (color === "black") {
    return "흑 기준";
  }
  return color;
}

export function checkpointStatusLabel(status: string): string {
  if (status === "in_progress") {
    return "진행 중";
  }
  if (status === "finished") {
    return "종료됨";
  }
  return status;
}

export function reviewResultLabel(result: string | null): string {
  if (result === "1-0") return "백 승";
  if (result === "0-1") return "흑 승";
  if (result === "1/2-1/2") return "무승부";
  return "복기 대기";
}

export function archiveResultLabel(result: string | null): string {
  if (result === "1-0") return "백 승";
  if (result === "0-1") return "흑 승";
  if (result === "1/2-1/2") return "무승부";
  return "진행 중";
}

export function drawReasonLabel(reason: string | null): string {
  if (reason === "stalemate") return "스테일메이트";
  if (reason === "insufficient_material") return "기물 부족";
  if (reason === "fifty_moves_claim") return "50수 규칙";
  if (reason === "threefold_repetition_claim") return "삼중 반복";
  return reason ?? "무승부";
}

export function formatEvaluation(score: EvaluationScore | null): string {
  if (!score) {
    return "평가 없음";
  }
  if (score.mate !== null) {
    return `${Math.abs(score.mate)}수 메이트`;
  }
  if (score.centipawns === null) {
    return "평가 없음";
  }
  return `${score.centipawns >= 0 ? "+" : ""}${(score.centipawns / 100).toFixed(2)}폰`;
}

export function formatScoreLoss(scoreLossCentipawns: number): string {
  return `${(scoreLossCentipawns / 100).toFixed(2)}폰 차이`;
}

export function translateMoveQuality(label: string): string {
  return MOVE_QUALITY_LABELS[label] ?? label;
}

export function weaknessTypeLabel(patternType: string): string {
  if (patternType === "tactics") return "전술";
  if (patternType === "king_safety") return "킹 안전";
  if (patternType === "development") return "전개";
  if (patternType === "structure") return "구조";
  return patternType.replace(/_/g, " ");
}

export function weaknessDisplayLabel(label: string): string {
  return WEAKNESS_LABELS[label] ?? label;
}

export function weaknessPriorityLabel(frequency: number): string {
  if (frequency >= 5) return "집중 필요";
  if (frequency >= 3) return "자주 반복됨";
  return "다시 점검";
}

export function weaknessPriorityTone(frequency: number): "high" | "medium" | "low" {
  if (frequency >= 5) return "high";
  if (frequency >= 3) return "medium";
  return "low";
}

export function weaknessRecencyLabel(lastSeenAt: string): string {
  const lastSeen = new Date(lastSeenAt).getTime();
  if (Number.isNaN(lastSeen)) {
    return "최근 기록";
  }

  const diffDays = Math.floor((Date.now() - lastSeen) / (1000 * 60 * 60 * 24));
  if (diffDays <= 2) return "최근 다시 나타남";
  if (diffDays <= 7) return "이번 주에 다시 등장";
  return "누적 관찰";
}

export function weaknessReplayAvailabilityLabel(count: number): string {
  if (count <= 0) return "사례 없음";
  if (count === 1) return "대표 사례 1개";
  return `대표 사례 ${count}개`;
}

export function weaknessTagLabel(patternType: string, patternKey: string): string {
  if (patternKey === "missed_tactical_pattern") {
    return "전술 기회 놓침";
  }
  if (patternKey === "delayed_castling") {
    return "캐슬링 지연";
  }
  if (patternKey === "delayed_piece_development") {
    return "기물 전개 지연";
  }
  if (patternKey.startsWith("pawn_structure:")) {
    return "비슷한 폰 구조 실수";
  }
  return `${weaknessTypeLabel(patternType)} · ${patternKey.replace(/_/g, " ")}`;
}

export function pieceNameLabel(piece: string): string {
  const color = piece === piece.toUpperCase() ? "백" : "흑";
  const name = {
    p: "폰",
    n: "나이트",
    b: "비숍",
    r: "룩",
    q: "퀸",
    k: "킹",
  }[piece.toLowerCase()];
  return `${color} ${name}`;
}

export function boardSquareAriaLabel(square: string, piece: string | null): string {
  return `${square}${piece ? ` ${pieceNameLabel(piece)}` : ` ${uiGlossary.board.emptySquare}`}`;
}

export function moveCountLabel(count: number): string {
  return `${count}수`;
}

export function movesPlayedLabel(count: number): string {
  return `${count}수 진행`;
}

export function legalMovesCountLabel(count: number): string {
  return `가능한 수 ${count}개`;
}

export function archiveCountLabel(count: number): string {
  return `저장된 대국 ${count}개`;
}

export function weaknessCountLabel(count: number): string {
  return `반복 약점 ${count}개`;
}

export function patternCountLabel(count: number): string {
  return `${count}개 패턴`;
}

export function frequencyLabel(count: number): string {
  return `${count}회`;
}

export function frequencyOccurredLabel(count: number): string {
  return `${count}회 발생`;
}

export function replayProgressLabel(current: number, total: number): string {
  return `${current}/${total}수`;
}

export function replayPlyLabel(plyIndex: number): string {
  return `${plyIndex}수째`;
}

export function relatedGameButtonLabel(gameId: string): string {
  return `저장된 대국 열기 ${gameId}`;
}

export function analysisStatusLabel(isReady: boolean, hasError: boolean): string {
  if (isReady) return uiStatusText.ready;
  if (hasError) return uiStatusText.unavailable;
  return uiStatusText.waiting;
}

export function reviewStatusLabel(hasReviewReady: boolean): string {
  return hasReviewReady ? uiStatusText.saved : uiStatusText.preparing;
}

export function liveStatusMessage(snapshotMoveCount: number): string {
  if (snapshotMoveCount <= 2) {
    return uiScreenText.live.phaseGuidance.opening;
  }
  if (snapshotMoveCount <= 8) {
    return uiScreenText.live.phaseGuidance.development;
  }
  if (snapshotMoveCount <= 18) {
    return uiScreenText.live.phaseGuidance.middlegame;
  }
  return uiScreenText.live.phaseGuidance.late;
}

export function selectionMessage(square: string): string {
  return `${square}를 선택했습니다. 도착 칸을 고르세요.`;
}

export function reviewContextLabel(kind: "mistake" | "good" | "turning"): string {
  if (kind === "mistake") return "중요한 실수";
  if (kind === "good") return "좋았던 수";
  return "흐름이 바뀐 순간";
}

export function reviewContextChipLabel(kind: "mistake" | "good" | "turning"): string {
  if (kind === "mistake") return "실수";
  if (kind === "good") return "좋았던 수";
  return "전환점";
}

export function reviewContextNote(kind: "mistake" | "good" | "turning", note: string): string {
  return `${reviewContextLabel(kind)}: ${note}`;
}

export function moveAppliedMessage(moveText: string): string {
  return `${moveText}이(가) 반영되었습니다.`;
}

export function moveAppliedWithQualityMessage(moveText: string, qualityText: string): string {
  return `${moveText}이(가) 반영되었습니다. 수 평가는 ${qualityText}입니다.`;
}

export function moveAppliedWithBestReplyMessage(moveText: string, bestMoveSan: string): string {
  return `${moveText}이(가) 반영되었습니다. 현재 추천 응수는 ${bestMoveSan}입니다.`;
}

export function moveAppliedWithoutAnalysisMessage(moveText: string): string {
  return `${moveText}이(가) 반영되었습니다. 이번 수의 분석은 불러오지 못했습니다.`;
}

export function checkmateMessage(winner: ColorName | null): string {
  return `체크메이트입니다. ${winner === "white" ? "백" : "흑"}이 이겼습니다.`;
}

export function drawMessage(drawReason: string | null): string {
  return drawReason ? `무승부입니다. 사유: ${drawReasonLabel(drawReason)}` : "무승부입니다.";
}

export function checkMessage(turnText: string): string {
  return `${turnText}이며 체크 상태입니다.`;
}

export function feedbackSummaryMessage(playedMoveSan: string, bestMoveSan: string): string {
  return `${playedMoveSan}은(는) 최선 수 ${bestMoveSan}과 비교해 이런 차이가 있습니다.`;
}

export function localizeBackendMessage(message: string): string {
  return message
    .replace("Engine path is not configured.", "엔진 경로가 설정되지 않았습니다.")
    .replace("Game was created in memory but could not be checkpointed.", "게임은 생성되었지만 저장 체크포인트를 남기지 못했습니다.")
    .replace("Game session was not found.", "진행 중인 대국을 찾지 못했습니다.")
    .replace("In-progress game was not found.", "이어할 대국을 찾지 못했습니다.")
    .replace("Archived game was not found.", "저장된 대국을 찾지 못했습니다.")
    .replace("Move was rejected because checkpoint persistence failed.", "체크포인트 저장에 실패해 수가 반영되지 않았습니다.")
    .replace("Failed to create a game.", uiStatusText.error.createGame)
    .replace("Failed to load archived games.", uiStatusText.error.loadArchiveList)
    .replace("Failed to load resumable games.", uiStatusText.error.loadResumeList)
    .replace("Failed to load weakness summary.", uiStatusText.error.loadWeakness)
    .replace("Failed to load archived game.", uiStatusText.error.loadArchive)
    .replace("Failed to resume saved game.", uiStatusText.error.resumeGame)
    .replace("Move failed.", uiStatusText.error.moveFailed)
    .replace("Analysis unavailable.", "분석을 불러오지 못했습니다.")
    .replace("Request failed with status", "요청 처리에 실패했습니다. 상태 코드");
}

export function localizeStudyText(text: string): string {
  return localizeBackendMessage(text)
    .replace("Rule-based review generated for this completed game.", "이 완료 대국에 대해 규칙 기반 복기 요약이 생성되었습니다.")
    .replace("Matched the best move.", "엔진의 1순위 수와 같은 선택이었습니다.")
    .replace("Your move stays close to the best line.", "최선의 흐름과 크게 어긋나지 않는 수였습니다.")
    .replace("Your move is usable, but there was a cleaner option.", "둘 수는 있었지만 더 깔끔한 선택이 있었습니다.")
    .replace("This move gives away some value and loosens the position.", "가치를 조금 내주면서 포지션을 다소 느슨하게 만들었습니다.")
    .replace("This choice misses a stronger continuation.", "더 강한 흐름을 놓친 선택이었습니다.")
    .replace("This choice misses a stronger continuation and shifts the game the wrong way.", "더 강한 흐름을 놓쳐 국면의 방향이 좋지 않게 바뀌었습니다.")
    .replace("This move drops too much value.", "가치를 너무 많이 잃은 수였습니다.")
    .replace("This move drops too much value compared with the engine's first choice.", "엔진의 1순위 수와 비교해 너무 많은 가치를 잃은 선택이었습니다.")
    .replace(/^You matched the engine's preferred move in this position\.$/, "이 장면에서는 엔진의 1순위 수와 같은 선택이었습니다.")
    .replace(/ The engine preferred ([^.]+)\./, " 이 장면에서 엔진은 $1를 더 높게 평가했습니다.")
    .replace(/^Plan: /, "계획: ")
    .replace(/Plan: fight for the center with ([^.]+)\./, "계획: $1로 중앙 주도권을 다투는 흐름을 보세요.")
    .replace(/Plan: improve piece activity by developing with ([^.]+)\./, "계획: $1로 기물을 전개하며 활동성을 높이세요.")
    .replace(/Plan: look for the active tactical idea ([^.]+) and punish loose pieces\./, "계획: $1 같은 전술 수를 먼저 확인하고 느슨한 기물을 압박하세요.")
    .replace(/Plan: activate the rook with ([^.]+) and increase pressure\./, "계획: $1로 룩을 활성화해 압박을 키우세요.")
    .replace(/Plan: use ([^.]+) to increase pressure, but keep queen activity coordinated\./, "계획: $1로 압박을 늘리되 퀸이 혼자 앞서가지 않게 조율하세요.")
    .replace("Plan: respond to the check first and stabilize the king.", "계획: 먼저 체크에 대응하며 킹을 안정시키세요.")
    .replace(/Plan: the engine wants ([^.]+) as the most direct improving move\./, "계획: 엔진은 $1를 가장 직접적인 개선 수로 보고 있습니다.")
    .replace(/Evaluation swung by ([0-9.]+) pawns after ([^.]+)\./, "$2 이후 평가가 $1폰만큼 크게 흔들렸습니다.")
    .replace("Study point: review the moments where one move changed the evaluation sharply.", "학습 포인트: 한 수로 평가가 크게 흔들린 장면을 다시 보며 왜 급격히 나빠졌는지 확인해 보세요.")
    .replace("Study point: spend time on tactical awareness and checking forcing moves first.", "학습 포인트: 수를 두기 전에 체크, 잡기, 직접 위협 같은 강제 수를 먼저 보는 습관을 들여 보세요.")
    .replace("Study point: compare your move choices with central control plans in the opening.", "학습 포인트: 오프닝에서는 중앙 장악 계획과 내 선택이 어떻게 달랐는지 비교해 보세요.")
    .replace("Study point: focus on faster development and piece activity in similar positions.", "학습 포인트: 비슷한 장면에서는 더 빠른 기물 전개와 활동성 확보에 집중해 보세요.")
    .replace("Study point: keep comparing your moves with the engine's first choice to sharpen move selection.", "학습 포인트: 내 수와 엔진의 1순위 수를 계속 비교하면서 수 선택 기준을 다듬어 보세요.")
    .replace(/Missed a forcing move when ([^.]+) was available\./, "$1 같은 강제 수를 볼 수 있었지만 놓친 장면입니다.")
    .replace("Castling was delayed even though king safety was the cleaner priority.", "킹 안전을 우선해야 하는 장면이었는데 캐슬링이 늦어졌습니다.")
    .replace("A developing move was available, but piece activity was delayed.", "전개 수가 가능했지만 기물 활동성을 높이는 흐름이 늦어졌습니다.")
    .replace("Repeated mistake found in a similar pawn structure.", "비슷한 폰 구조에서 반복되는 실수가 다시 나타났습니다.")
    .replace("Before every move, scan forcing moves first: checks, captures, and direct threats.", "수를 두기 전에 체크, 잡기, 직접 위협 같은 강제 수를 먼저 확인하는 습관을 들여 보세요.")
    .replace("Castle earlier when the center is opening so king safety stops becoming a repeated tax.", "중앙이 열리기 시작하면 캐슬링을 더 서둘러 킹 안전이 반복 약점이 되지 않게 해 보세요.")
    .replace("In the opening, bring out knights and bishops before spending extra tempi on side moves.", "오프닝에서는 옆쪽 수에 템포를 쓰기 전에 나이트와 비숍부터 자연스럽게 전개해 보세요.")
    .replace("Review games with this pawn structure and note which files, weak squares, and breaks caused trouble.", "이 폰 구조가 나온 대국을 다시 보면서 어떤 파일, 약한 칸, 브레이크가 문제였는지 정리해 보세요.")
    .replace("Replay the related games and identify the repeated decision pattern before the position collapses.", "관련 대국을 다시 보며 포지션이 무너지기 전에 어떤 판단이 반복되었는지 찾아보세요.");
}
