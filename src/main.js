

class GameState {
  constructor() {
    this.board = Array(9).fill(null);
    this.currentPlayer = 'X';
    this.gameStatus = 'playing'; 
    this.winner = null;
    this.winningLine = null;
  }

  reset() {
    this.board = Array(9).fill(null);
    this.currentPlayer = 'X';
    this.gameStatus = 'playing';
    this.winner = null;
    this.winningLine = null;
  }
}

class MatchState {
  constructor() {
    this.roundsWon = 0;
    this.roundsLost = 0;
    this.currentRound = 1;
    this.totalRounds = 5;
    this.matchScore = 0;
    this.totalScore = parseInt(localStorage.getItem('ticTacToeScore') || '0');
    this.aiDifficulty = 0.1;
    this.selectedRounds = 5;
  }

  reset() {
    this.roundsWon = 0;
    this.roundsLost = 0;
    this.currentRound = 1;
    this.matchScore = 0;
    this.aiDifficulty = 0.1;
  }
}

class TicTacToeGame {
  constructor() {
    this.gameState = new GameState();
    this.matchState = new MatchState();
    this.currentScreen = 'match-setup';
    this.isMatchActive = false;
    this.showResults = false;
    this.soundEnabled = true;
    
    this.winningCombinations = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8], 
      [0, 3, 6], [1, 4, 7], [2, 5, 8], 
      [0, 4, 8], [2, 4, 6] 
    ];

    this.init();
  }

  init() {
    this.setupEventListeners();
    this.updateUI();
  }

  setupEventListeners() {
    
    document.querySelectorAll('.round-option').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.round-option').forEach(b => {
          b.className = b.className.replace('btn-game', 'btn-outline');
        });
        btn.className = btn.className.replace('btn-outline', 'btn-game');
        this.matchState.selectedRounds = parseInt(btn.dataset.rounds);
        document.getElementById('start-match').textContent = `Start Match (${this.matchState.selectedRounds} rounds)`;
      });
    });

    
    document.getElementById('start-match').addEventListener('click', () => {
      this.startMatch(this.matchState.selectedRounds);
    });


    document.querySelectorAll('.game-cell').forEach(cell => {
      cell.addEventListener('click', () => {
        const index = parseInt(cell.dataset.index);
        this.makeMove(index);
      });
    });

    
    document.getElementById('quit-match').addEventListener('click', () => {
      this.newMatch();
    });

    
    document.getElementById('play-again').addEventListener('click', () => {
      this.newMatch();
    });
  }

  showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
      screen.classList.remove('active');
    });
    document.getElementById(screenId).classList.add('active');
    this.currentScreen = screenId;
  }

  playSound(type) {
    if (!this.soundEnabled) return;
    
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      
      switch (type) {
        case 'move':
          this.playMoveSound(audioContext);
          break;
        case 'win':
          this.playWinSound(audioContext);
          break;
        case 'lose':
          this.playLoseSound(audioContext);
          break;
        case 'tie':
          this.playTieSound(audioContext);
          break;
      }
    } catch (error) {
      console.log('Audio not supported');
    }
  }

  playMoveSound(audioContext) {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
    gain.gain.setValueAtTime(0.1, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.1);
  }

  playWinSound(audioContext) {
    [523, 659, 784].forEach((freq, i) => {
      const osc = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      osc.connect(gainNode);
      gainNode.connect(audioContext.destination);
      osc.frequency.setValueAtTime(freq, audioContext.currentTime + i * 0.15);
      gainNode.gain.setValueAtTime(0.2, audioContext.currentTime + i * 0.15);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + i * 0.15 + 0.3);
      osc.start(audioContext.currentTime + i * 0.15);
      osc.stop(audioContext.currentTime + i * 0.15 + 0.3);
    });
  }

  playLoseSound(audioContext) {
    [440, 370, 311].forEach((freq, i) => {
      const osc = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      osc.connect(gainNode);
      gainNode.connect(audioContext.destination);
      osc.frequency.setValueAtTime(freq, audioContext.currentTime + i * 0.2);
      gainNode.gain.setValueAtTime(0.15, audioContext.currentTime + i * 0.2);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + i * 0.2 + 0.4);
      osc.start(audioContext.currentTime + i * 0.2);
      osc.stop(audioContext.currentTime + i * 0.2 + 0.4);
    });
  }

  playTieSound(audioContext) {
    const tieOsc = audioContext.createOscillator();
    const tieGain = audioContext.createGain();
    tieOsc.connect(tieGain);
    tieGain.connect(audioContext.destination);
    tieOsc.frequency.setValueAtTime(500, audioContext.currentTime);
    tieGain.gain.setValueAtTime(0.1, audioContext.currentTime);
    tieGain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
    tieOsc.start(audioContext.currentTime);
    tieOsc.stop(audioContext.currentTime + 0.5);
  }

  checkWinner(board) {
    for (const combination of this.winningCombinations) {
      const [a, b, c] = combination;
      if (board[a] && board[a] === board[b] && board[a] === board[c]) {
        return { winner: board[a], winningLine: combination };
      }
    }
    return null;
  }

  getAIMove(board, difficulty) {
    const availableMoves = board.map((cell, index) => cell === null ? index : null)
      .filter(index => index !== null);

    if (availableMoves.length === 0) return null;

    if (Math.random() > difficulty) {
      return availableMoves[Math.floor(Math.random() * availableMoves.length)];
    }


    for (const move of availableMoves) {
      const testBoard = [...board];
      testBoard[move] = 'O';
      if (this.checkWinner(testBoard)?.winner === 'O') {
        return move;
      }
    }

    
    for (const move of availableMoves) {
      const testBoard = [...board];
      testBoard[move] = 'X';
      if (this.checkWinner(testBoard)?.winner === 'X') {
        return move;
      }
    }

    
    const strategicMoves = [4, 0, 2, 6, 8, 1, 3, 5, 7];
    for (const move of strategicMoves) {
      if (availableMoves.includes(move)) {
        return move;
      }
    }

    return availableMoves[0];
  }

  makeMove(index) {
    if (this.gameState.board[index] || this.gameState.gameStatus !== 'playing') return;

    const newBoard = [...this.gameState.board];
    newBoard[index] = this.gameState.currentPlayer;
    this.gameState.board = newBoard;

    this.playSound('move');
    this.updateGameBoard();

    const result = this.checkWinner(newBoard);
    if (result) {
      this.gameState.gameStatus = 'won';
      this.gameState.winner = result.winner;
      this.gameState.winningLine = result.winningLine;
      this.highlightWinningLine(result.winningLine);
      this.updateGameStatus();
      this.handleRoundEnd();
      return;
    }

    if (newBoard.every(cell => cell !== null)) {
      this.gameState.gameStatus = 'tie';
      this.updateGameStatus();
      this.handleRoundEnd();
      return;
    }

    this.gameState.currentPlayer = this.gameState.currentPlayer === 'X' ? 'O' : 'X';
    this.updateGameStatus();

    
    if (this.gameState.currentPlayer === 'O' && this.gameState.gameStatus === 'playing') {
      setTimeout(() => {
        const aiMove = this.getAIMove(this.gameState.board, this.matchState.aiDifficulty);
        if (aiMove !== null) {
          this.makeMove(aiMove);
        }
      }, 500 + Math.random() * 1000);
    }
  }

  handleRoundEnd() {
    setTimeout(() => {
      let scoreChange = 0;

      if (this.gameState.winner === 'X') {
        scoreChange = 2;
        this.matchState.roundsWon++;
        this.matchState.aiDifficulty = Math.min(1.0, this.matchState.aiDifficulty + 0.1);
        this.playSound('win');
      } else if (this.gameState.winner === 'O') {
        scoreChange = -1;
        this.matchState.roundsLost++;
        this.matchState.aiDifficulty = Math.max(0.1, this.matchState.aiDifficulty - 0.05);
        this.playSound('lose');
      } else {
        scoreChange = 0;
        this.playSound('tie');
      }

      this.matchState.matchScore += scoreChange;
      this.matchState.currentRound++;

      this.updateUI();

      if (this.matchState.currentRound > this.matchState.totalRounds) {
        
        const finalTotalScore = this.matchState.totalScore + this.matchState.matchScore;
        localStorage.setItem('ticTacToeScore', finalTotalScore.toString());
        this.matchState.totalScore = finalTotalScore;
        
        this.showResults = true;
        this.isMatchActive = false;
        this.showScreen('match-results');
        this.updateMatchResults();
      } else {
        
        this.gameState.reset();
        this.updateGameBoard();
        this.updateGameStatus();
        this.updateUI();
      }
    }, 1500);
  }

  highlightWinningLine(winningLine) {
    winningLine.forEach(index => {
      const cell = document.querySelector(`[data-index="${index}"]`);
      cell.classList.add('winning-cell');
    });
  }

  startMatch(totalRounds) {
    this.matchState.reset();
    this.matchState.totalRounds = totalRounds;
    this.gameState.reset();
    this.isMatchActive = true;
    this.showResults = false;
    this.showScreen('game-view');
    this.updateUI();
  }

  newMatch() {
    this.isMatchActive = false;
    this.showResults = false;
    this.showScreen('match-setup');
    this.updateUI();
  }

  updateUI() {
    this.updateTotalScore();
    this.updateGameStats();
    this.updateGameBoard();
    this.updateGameStatus();
    this.updateAIDifficulty();
  }

  updateTotalScore() {
    document.getElementById('total-score').textContent = this.matchState.totalScore;
    const gameTotalScore = document.getElementById('game-total-score');
    if (gameTotalScore) {
      gameTotalScore.textContent = this.matchState.totalScore;
    }
  }

  updateGameStats() {
    const matchScore = document.getElementById('match-score');
    const roundInfo = document.getElementById('round-info');
    const winsLosses = document.getElementById('wins-losses');

    if (matchScore) matchScore.textContent = this.matchState.matchScore;
    if (roundInfo) roundInfo.textContent = `Round ${this.matchState.currentRound}/${this.matchState.totalRounds}`;
    if (winsLosses) winsLosses.textContent = `W: ${this.matchState.roundsWon} • L: ${this.matchState.roundsLost}`;
  }

  updateGameBoard() {
    document.querySelectorAll('.game-cell').forEach((cell, index) => {
      const value = this.gameState.board[index];
      cell.textContent = value || '';
      cell.disabled = !!value || this.gameState.gameStatus !== 'playing';
      cell.classList.remove('winning-cell');
      
      if (value) {
        cell.classList.add('animate-bounce-in');
        cell.classList.add(value === 'X' ? 'text-game-x' : 'text-game-o');
      } else {
        cell.classList.remove('animate-bounce-in', 'text-game-x', 'text-game-o');
      }
    });
  }

  updateGameStatus() {
    const gameStatus = document.getElementById('game-status');
    if (!gameStatus) return;

    let message = '';
    let colorClass = 'text-foreground';

    if (this.gameState.gameStatus === 'won') {
      message = this.gameState.winner === 'X' ? 'You Won This Round!' : 'AI Won This Round!';
      colorClass = this.gameState.winner === 'X' ? 'text-primary' : 'text-danger';
    } else if (this.gameState.gameStatus === 'tie') {
      message = 'Round Tied!';
      colorClass = 'text-accent';
    } else {
      message = this.gameState.currentPlayer === 'X' ? 'Your Turn' : 'AI is thinking...';
    }

    gameStatus.textContent = message;
    gameStatus.className = `text-2xl font-bold mb-4 ${colorClass}`;
  }

  updateAIDifficulty() {
    const difficultyLabel = document.getElementById('ai-difficulty-label');
    const difficultyBar = document.getElementById('ai-difficulty-bar');
    
    if (!difficultyLabel || !difficultyBar) return;

    const difficulty = this.matchState.aiDifficulty;
    let label = 'Warming Up';
    let colorClass = 'text-primary';

    if (difficulty >= 0.9) {
      label = 'Maximum';
      colorClass = 'text-danger animate-pulse';
    } else if (difficulty >= 0.7) {
      label = 'Intense';
      colorClass = 'text-danger';
    } else if (difficulty >= 0.5) {
      label = 'Challenging';
      colorClass = 'text-accent';
    } else if (difficulty >= 0.3) {
      label = 'Getting Serious';
      colorClass = 'text-secondary';
    }

    difficultyLabel.textContent = `AI Difficulty: ${label}`;
    difficultyLabel.className = `text-lg font-semibold ${colorClass}`;
    difficultyBar.style.width = `${difficulty * 100}%`;
  }

  updateMatchResults() {
    const isWinner = this.matchState.roundsWon > this.matchState.roundsLost;
    const isTie = this.matchState.roundsWon === this.matchState.roundsLost;
    
    
    const resultTitle = document.getElementById('result-title');
    let title = 'Victory!';
    let titleColor = 'text-primary';
    
    if (isTie) {
      title = 'Match Tied!';
      titleColor = 'text-accent';
    } else if (!isWinner) {
      title = 'Defeat!';
      titleColor = 'text-danger';
    }
    
    resultTitle.textContent = title;
    resultTitle.className = `text-4xl font-bold mb-4 ${titleColor}`;

    document.getElementById('final-score').textContent = 
      `${this.matchState.roundsWon} - ${this.matchState.roundsLost}`;
    
    const scoreChange = document.getElementById('score-change');
    const change = this.matchState.matchScore;
    scoreChange.textContent = `${change > 0 ? '+' : ''}${change}`;
    
    let changeColor = 'text-muted-foreground';
    if (change > 0) changeColor = 'text-primary';
    else if (change < 0) changeColor = 'text-danger';
    
    scoreChange.className = `text-lg font-bold ${changeColor}`;
    
    
    document.getElementById('new-total-score').textContent = this.matchState.totalScore;
    
    const resultMessage = document.getElementById('result-message');
    let message = 'Great job! The AI will be tougher next time.';
    
    if (isTie) {
      message = 'Even match! Ready for another?';
    } else if (!isWinner) {
      message = "Don't give up! You can bounce back.";
    }
    
    resultMessage.textContent = message;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new TicTacToeGame();
});