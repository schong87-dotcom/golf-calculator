// 참가자 순서별 표시 색. 앞 4색은 골프 정산 원래 색 그대로이고, 모임 정산의 5번째 이후 인원을 위해 뒤에 이어 붙였다.
export const PARTICIPANT_COLORS = [
  '#4caf50', '#2196f3', '#ff9800', '#f44336',
  '#9c27b0', '#009688', '#795548', '#3f51b5',
  '#e91e63', '#607d8b', '#ff5722', '#00acc1',
];

export const PARTICIPANT_BG_COLORS = [
  '#e8f5e9', '#e3f2fd', '#fff3e0', '#ffebee',
  '#f3e5f5', '#e0f2f1', '#efebe9', '#e8eaf6',
  '#fce4ec', '#eceff1', '#fbe9e7', '#e0f7fa',
];

// 12명을 넘으면 처음 색부터 다시 돈다
export const colorAt = index => PARTICIPANT_COLORS[index % PARTICIPANT_COLORS.length];
export const bgColorAt = index => PARTICIPANT_BG_COLORS[index % PARTICIPANT_BG_COLORS.length];
