import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import './styles.css';

let scene, camera, renderer, controls;
let board = Array(9).fill(null);
let currentPlayer = 'Player 1';
let gameActive = true;
let vsComputer = false;
let difficulty = 'medium';
let cells = [];
let markers = [];
let raycaster = new THREE.Raycaster();
let mouse = new THREE.Vector2();
let clickSound, winSound, loseSound, tieSound;
let scores = loadData().scores;
let winningLine = null;
let isTouching = false;
let boardBase = null;

const winningCombinations = [
    [0,1,2], [3,4,5], [6,7,8], // Rows
    [0,3,6], [1,4,7], [2,5,8], // Columns
    [0,4,8], [2,4,6] // Diagonals
];

function init() {
    const savedData = loadData();
    difficulty = savedData.settings.difficulty;

    const requiredElements = ['quickplay', 'vscomputer', 'settings', 'how-to-play-btn', 'back', 'back-to-menu', 'new-game', 'difficulty', 'reset-scores', 'canvas', 'menu', 'game', 'settings-menu', 'how-to-play', 'back-from-how-to-play', 'game-status', 'score-player1', 'score-player2', 'score-ties'];
    for (const id of requiredElements) {
        if (!document.getElementById(id)) {
            console.warn(`DOM element #${id} not found`);
        }
    }

    const quickplay = document.getElementById('quickplay');
    const vscomputer = document.getElementById('vscomputer');
    const settingsBtn = document.getElementById('settings');
    const howToPlayBtn = document.getElementById('how-to-play-btn');
    const back = document.getElementById('back');
    const backToMenu = document.getElementById('back-to-menu');
    const backFromHowToPlay = document.getElementById('back-from-how-to-play');
    const newGame = document.getElementById('new-game');
    const difficultySelect = document.getElementById('difficulty');
    const resetScoresBtn = document.getElementById('reset-scores');

    if (quickplay) quickplay.addEventListener('click', () => startGame(false));
    if (vscomputer) vscomputer.addEventListener('click', () => startGame(true));
    if (settingsBtn) settingsBtn.addEventListener('click', showSettings);
    if (howToPlayBtn) howToPlayBtn.addEventListener('click', showHowToPlay);
    if (back) back.addEventListener('click', showMainMenu);
    if (backToMenu) backToMenu.addEventListener('click', showMainMenu);
    if (backFromHowToPlay) backFromHowToPlay.addEventListener('click', showMainMenu);
    if (newGame) newGame.addEventListener('click', restartGame);
    if (difficultySelect) {
        difficultySelect.addEventListener('change', (e) => {
            difficulty = e.target.value;
            saveData();
        });
        difficultySelect.value = difficulty;
    }
    if (resetScoresBtn) resetScoresBtn.addEventListener('click', resetScores);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a2634);
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('canvas'), antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableZoom = window.innerWidth > 480;
    controls.minDistance = window.innerWidth <= 480 ? 14 : 18;
    controls.maxDistance = window.innerWidth >= 1200 ? 70 : 50;
    controls.enablePan = false;
    camera.position.set(20, 20, 20);
    controls.update();

    const ambientLight = new THREE.AmbientLight(0x404040, 0.7);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
    directionalLight.position.set(10, 20, 10);
    scene.add(directionalLight);

    clickSound = new Audio('/assets/click.wav');
    winSound = new Audio('/assets/wins.wav');
    loseSound = new Audio('/assets/lose.mp3');
    tieSound = new Audio('/assets/tie.wav');

    createBoard();
    updateScoreDisplay();

    const canvas = document.getElementById('canvas');
    if (canvas) {
        canvas.addEventListener('mousemove', onMouseMove);
        canvas.addEventListener('click', onCanvasClick);
        canvas.addEventListener('touchstart', onCanvasTouch, { passive: false });
    }

    const savedGame = savedData.gameState;
    if (savedGame && isValidGameState(savedGame)) {
        board = savedGame.board;
        currentPlayer = savedGame.currentPlayer;
        vsComputer = savedGame.vsComputer;
        difficulty = savedGame.difficulty;
        gameActive = savedGame.gameActive;
        winningLine = savedGame.winningLine;
        const menu = document.getElementById('menu');
        const game = document.getElementById('game');
        const gameStatus = document.getElementById('game-status');
        if (menu) menu.classList.add('hidden');
        if (game) game.classList.remove('hidden');
        if (gameStatus) {
            gameStatus.textContent = gameActive ? `${currentPlayer}'s turn` : (winningLine ? `${currentPlayer} wins!` : "It's a tie!");
        }
        updateScoreDisplay();
        board.forEach((player, index) => {
            if (player) {
                const pos = cells[index].position;
                createMarker(player, pos, index);
            }
        });
        if (winningLine) {
            highlightWinningLine(winningLine);
        }
    }

    window.addEventListener('resize', () => {
        onWindowResize();
        updateCameraDistance();
    });
    animate();
}

function updateCameraDistance() {
    const width = window.innerWidth;
    controls.minDistance = width <= 480 ? 14 : 18;
    controls.maxDistance = width >= 1200 ? 70 : 50;
    controls.update();
}

function createBoard() {
    cells.forEach(cell => scene.remove(cell));
    cells = [];
    if (boardBase) scene.remove(boardBase);

    const boardScaleFactor = 5.0;
    const cellScaleFactor = 7.0;
    const boardGeometry = new THREE.BoxGeometry(6 * boardScaleFactor, 0.4, 6 * boardScaleFactor);
    const boardMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x8b4513,
        roughness: 0.5,
        metalness: 0.05
    });
    boardBase = new THREE.Mesh(boardGeometry, boardMaterial);
    scene.add(boardBase);

    const cellGeometry = new THREE.BoxGeometry(0.9 * cellScaleFactor, 0.1, 0.9 * cellScaleFactor);
    const cellMaterial = new THREE.MeshStandardMaterial({ 
        color: 0xcccccc,
        roughness: 0.5,
        metalness: 0.1
    });

    const spacing = 1.8 * boardScaleFactor;
    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
            const cell = new THREE.Mesh(cellGeometry, cellMaterial.clone());
            cell.position.set((i - 1) * spacing, 0.6, (j - 1) * spacing);
            cell.userData = { index: i * 3 + j, baseColor: 0xcccccc };
            scene.add(cell);
            cells.push(cell);
        }
    }

    const lineMaterial = new THREE.LineBasicMaterial({ color: 0xffffff });
    const points = [];
    for (let i = 0; i <= 3; i++) {
        const x = i * spacing - 1.5 * spacing / 2;
        points.push(new THREE.Vector3(x, 0.4, -1.5 * spacing / 2));
        points.push(new THREE.Vector3(x, 0.4, 1.5 * spacing / 2));
    }
    for (let j = 0; j <= 3; j++) {
        const z = j * spacing - 1.5 * spacing / 2;
        points.push(new THREE.Vector3(-1.5 * spacing / 2, 0.4, z));
        points.push(new THREE.Vector3(1.5 * spacing / 2, 0.4, z));
    }
    const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
    const gridLines = new THREE.LineSegments(lineGeometry, lineMaterial);
    scene.add(gridLines);
}

function onCanvasClick(event) {
    event.preventDefault();
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(cells);

    if (intersects.length > 0 && gameActive) {
        const index = intersects[0].object.userData.index;
        makeMove(index);
    }
}

function onCanvasTouch(event) {
    if (isTouching) return;
    isTouching = true;
    setTimeout(() => { isTouching = false; }, 300);
    event.preventDefault();
    const touch = event.touches[0];
    mouse.x = (touch.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(touch.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(cells);

    if (intersects.length > 0 && gameActive) {
        const index = intersects[0].object.userData.index;
        makeMove(index);
    }
}

function createMarker(type, position, index) {
    console.log(`Creating marker for ${type} at index ${index}, position:`, position);
    const markerScaleFactor = 5.0;
    let geometry, material, marker;

    if (type === 'Player 1') {
        const box1 = new THREE.BoxGeometry(0.8 * markerScaleFactor, 0.3, 0.3);
        const box2 = new THREE.BoxGeometry(0.8 * markerScaleFactor, 0.3, 0.3);
        box2.rotateZ(Math.PI / 2);
        geometry = BufferGeometryUtils.mergeGeometries([box1, box2]);
        material = new THREE.MeshBasicMaterial({
            color: 0x000000
        });
    } else {
        geometry = new THREE.RingGeometry(0.25 * markerScaleFactor, 0.45 * markerScaleFactor, 32);
        material = new THREE.MeshBasicMaterial({
            color: 0x5555ff,
            side: THREE.DoubleSide
        });
    }

    marker = new THREE.Mesh(geometry, material);
    marker.position.set(position.x, 0.7, position.z);
    marker.rotation.x = Math.PI / 2;
    marker.userData = { index };
    scene.add(marker);
    markers.push(marker);
    console.log(`${type} marker added to scene at position:`, marker.position, 'with scale:', marker.scale);

    if (clickSound) clickSound.play().catch(e => console.warn('Click sound play error:', e));
}

function loadData() {
    const saved = localStorage.getItem('ticTacToeData');
    const defaultData = {
        scores: { 'Player 1': 0, 'Player 2': 0, 'Ties': 0 },
        gameState: null,
        settings: { difficulty: 'medium' }
    };
    if (!saved) return defaultData;
    try {
        const data = JSON.parse(saved);
        if (!data.scores || !data.settings) {
            console.warn('Invalid localStorage data structure');
            return defaultData;
        }
        if (!['easy', 'medium', 'hard'].includes(data.settings.difficulty)) {
            data.settings.difficulty = 'medium';
        }
        return data;
    } catch (e) {
        console.warn('Failed to parse localStorage data:', e.message);
        return defaultData;
    }
}

function saveData() {
    const data = {
        scores,
        gameState: gameActive ? getGameState() : null,
        settings: { difficulty }
    };
    try {
        localStorage.setItem('ticTacToeData', JSON.stringify(data));
    } catch (e) {
        console.warn('Failed to save to localStorage:', e.message);
        if (e.name === 'QuotaExceededError') {
            console.warn('Storage quota exceeded, clearing localStorage');
            localStorage.removeItem('ticTacToeData');
            localStorage.setItem('ticTacToeData', JSON.stringify(data));
        }
    }
}

function isValidGameState(state) {
    if (!state || !state.board || state.board.length !== 9) return false;
    if (!['Player 1', 'Player 2'].includes(state.currentPlayer)) return false;
    if (typeof state.vsComputer !== 'boolean') return false;
    if (!['easy', 'medium', 'hard'].includes(state.difficulty)) return false;
    if (typeof state.gameActive !== 'boolean') return false;
    if (state.winningLine && (!Array.isArray(state.winningLine) || state.winningLine.length !== 3)) return false;
    return true;
}

function resetScores() {
    scores = { 'Player 1': 0, 'Player 2': 0, 'Ties': 0 };
    saveData();
    updateScoreDisplay();
}

function updateScoreDisplay() {
    const scorePlayer1 = document.getElementById('score-player1');
    const scorePlayer2 = document.getElementById('score-player2');
    const scoreTies = document.getElementById('score-ties');
    if (scorePlayer1) scorePlayer1.textContent = `Player 1: ${scores['Player 1']}`;
    if (scorePlayer2) scorePlayer2.textContent = `Player 2: ${scores['Player 2']}`;
    if (scoreTies) scoreTies.textContent = `Ties: ${scores['Ties']}`;
}

function updateScore(winner) {
    if (winner) {
        scores[winner]++;
        saveData();
        const scoreElement = document.getElementById(`score-${winner.toLowerCase().replace(' ', '')}`);
        if (scoreElement) scoreElement.textContent = `${winner}: ${scores[winner]}`;
        if (winner === 'Player 1' && winSound) {
            winSound.pause();
            winSound.currentTime = 0;
            winSound.play().catch(e => console.warn('Win sound play error:', e));
        } else if (winner === 'Player 2' && loseSound) {
            loseSound.pause();
            loseSound.currentTime = 0;
            loseSound.play().catch(e => console.warn('Lose sound play error:', e));
        }
    } else {
        scores['Ties']++;
        saveData();
        const scoreTies = document.getElementById('score-ties');
        if (scoreTies) scoreTies.textContent = `Ties: ${scores['Ties']}`;
        if (tieSound) {
            tieSound.pause();
            tieSound.currentTime = 0;
            tieSound.play().catch(e => console.warn('Tie sound play error:', e));
        }
    }
    if (!gameActive) saveData();
}

function highlightWinningLine(combo) {
    combo.forEach(index => {
        const cell = cells[index];
        cell.material.color.setHex(currentPlayer === 'Player 1' ? 0x000000 : 0x5555ff);
    });
}

function onMouseMove(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(cells);

    cells.forEach(cell => {
        cell.material.color.setHex(cell.userData.baseColor);
    });

    if (intersects.length > 0 && gameActive && !board[intersects[0].object.userData.index]) {
        const cell = intersects[0].object;
        cell.material.color.setHex(0x00ff00);
    }
}

function showHowToPlay() {
    const menu = document.getElementById('menu');
    const howToPlay = document.getElementById('how-to-play');
    if (menu) menu.classList.add('hidden');
    if (howToPlay) howToPlay.classList.remove('hidden');
}

function startGame(isVsComputer) {
    vsComputer = isVsComputer;
    board = Array(9).fill(null);
    currentPlayer = 'Player 1';
    gameActive = true;
    winningLine = null;
    const menu = document.getElementById('menu');
    const settingsMenu = document.getElementById('settings-menu');
    const howToPlay = document.getElementById('how-to-play');
    const game = document.getElementById('game');
    const gameStatus = document.getElementById('game-status');
    if (menu) menu.classList.add('hidden');
    if (settingsMenu) settingsMenu.classList.add('hidden');
    if (howToPlay) howToPlay.classList.add('hidden');
    if (game) game.classList.remove('hidden');
    if (gameStatus) gameStatus.textContent = `${currentPlayer}'s turn`;

    markers.forEach(marker => scene.remove(marker));
    markers = [];
    cells.forEach(cell => {
        cell.material.color.setHex(0xcccccc);
    });
    updateScoreDisplay();
    saveData();

    if (vsComputer && currentPlayer === 'Player 2') {
        setTimeout(computerMove, 1000);
    }
}

function restartGame() {
    board = Array(9).fill(null);
    currentPlayer = 'Player 1';
    gameActive = true;
    winningLine = null;
    const gameStatus = document.getElementById('game-status');
    if (gameStatus) gameStatus.textContent = `${currentPlayer}'s turn`;

    markers.forEach(marker => scene.remove(marker));
    markers = [];
    cells.forEach(cell => {
        cell.material.color.setHex(0xcccccc);
    });
    updateScoreDisplay();
    saveData();

    if (vsComputer && currentPlayer === 'Player 2') {
        setTimeout(computerMove, 1000);
    }
}

function makeMove(index) {
    console.log(`Making move at index ${index} for ${currentPlayer}`);
    if (board[index] || !gameActive) {
        console.warn(`Move blocked: index ${index}, gameActive: ${gameActive}`);
        return;
    }

    board[index] = currentPlayer;
    const pos = cells[index].position;
    createMarker(currentPlayer, pos, index);
    saveData();

    const winCombo = checkWin();
    if (winCombo) {
        const gameStatus = document.getElementById('game-status');
        if (gameStatus) gameStatus.textContent = `${currentPlayer} wins!`;
        gameActive = false;
        winningLine = winCombo;
        highlightWinningLine(winCombo);
        updateScore(currentPlayer);
        return;
    }

    if (board.every(cell => cell)) {
        const gameStatus = document.getElementById('game-status');
        if (gameStatus) gameStatus.textContent = "It's a tie!";
        gameActive = false;
        updateScore(null);
        return;
    }

    currentPlayer = currentPlayer === 'Player 1' ? 'Player 2' : 'Player 1';
    const gameStatus = document.getElementById('game-status');
    if (gameStatus) gameStatus.textContent = `${currentPlayer}'s turn`;
    saveData();

    if (vsComputer && currentPlayer === 'Player 2' && gameActive) {
        console.log('Scheduling computer move');
        setTimeout(computerMove, 1000);
    }
}

function computerMove() {
    console.log('Computer move triggered');
    let move;
    if (difficulty === 'easy') {
        move = getRandomMove();
    } else if (difficulty === 'medium') {
        move = getBestMove(0.7);
    } else {
        move = getBestMove(1);
    }

    if (move !== null) {
        console.log(`Computer chose move at index ${move}`);
        makeMove(move);
    } else {
        console.warn('No valid move found for computer');
    }
}

function getRandomMove() {
    const available = board
        .map((cell, index) => cell === null ? index : null)
        .filter(index => index !== null);
    return available[Math.floor(Math.random() * available.length)];
}

function getBestMove(chance) {
    for (let combo of winningCombinations) {
        const [a, b, c] = combo;
        if (board[a] === 'Player 2' && board[b] === 'Player 2' && !board[c]) return c;
        if (board[a] === 'Player 2' && !board[b] && board[c] === 'Player 2') return b;
        if (!board[a] && board[b] === 'Player 2' && board[c] === 'Player 2') return a;
    }

    for (let combo of winningCombinations) {
        const [a, b, c] = combo;
        if (board[a] === 'Player 1' && board[b] === 'Player 1' && !board[c]) return c;
        if (board[a] === 'Player 1' && !board[b] && board[c] === 'Player 1') return b;
        if (!board[a] && board[b] === 'Player 1' && board[c] === 'Player 1') return a;
    }

    if (difficulty === 'hard' || (difficulty === 'medium' && Math.random() < chance)) {
        const forks = [
            { index: 0, combos: [[0,1,2], [0,3,6], [0,4,8]] },
            { index: 2, combos: [[0,1,2], [2,5,8], [2,4,6]] },
            { index: 6, combos: [[6,7,8], [0,3,6], [0,4,8]] },
            { index: 8, combos: [[6,7,8], [2,5,8], [0,4,8]] },
            { index: 4, combos: [[1,4,7], [3,4,5], [0,4,8], [2,4,6]] }
        ];
        for (let fork of forks) {
            if (!board[fork.index]) {
                const futureWins = fork.combos.filter(combo => {
                    const opponentCount = combo.filter(i => board[i] === 'Player 1').length;
                    const emptyCount = combo.filter(i => !board[i]).length;
                    return opponentCount === 0 && emptyCount >= 2;
                });
                if (futureWins.length >= (difficulty === 'hard' ? 2 : 1)) {
                    return fork.index;
                }
            }
        }
    }

    if (Math.random() < chance) {
        if (!board[4]) return 4;
        for (let i of [0, 2, 6, 8]) {
            if (!board[i]) return i;
        }
    }

    return getRandomMove();
}

function checkWin() {
    for (let combo of winningCombinations) {
        if (combo.every(index => board[index] === currentPlayer)) {
            return combo;
        }
    }
    return null;
}

function getGameState() {
    return {
        board: [...board],
        currentPlayer,
        scores,
        vsComputer,
        difficulty,
        gameActive,
        winningLine
    };
}

function showSettings() {
    const menu = document.getElementById('menu');
    const settingsMenu = document.getElementById('settings-menu');
    if (menu) menu.classList.add('hidden');
    if (settingsMenu) settingsMenu.classList.remove('hidden');
}

function showMainMenu() {
    const game = document.getElementById('game');
    const settingsMenu = document.getElementById('settings-menu');
    const howToPlay = document.getElementById('how-to-play');
    const menu = document.getElementById('menu');
    if (game) game.classList.add('hidden');
    if (settingsMenu) settingsMenu.classList.add('hidden');
    if (howToPlay) howToPlay.classList.add('hidden');
    if (menu) menu.classList.remove('hidden');
    saveData();
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

init();