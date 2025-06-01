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
let hoveredCell = null;

const winningCombinations = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
];

function init() {
    const savedData = loadData();
    difficulty = savedData.settings.difficulty;

    scene = new THREE.Scene();
    const textureLoader = new THREE.TextureLoader();
    textureLoader.load('/assets/paper-texture.jpg', (texture) => {
        scene.background = texture;
    }, undefined, () => {
        scene.background = new THREE.Color(0xf5f5dc);
    });

    camera = new THREE.OrthographicCamera(window.innerWidth / -20, window.innerWidth / 20, window.innerHeight / 20, window.innerHeight / -20, 1, 1000);
    renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('canvas'), antialias: true });
    updateRendererSize();

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableZoom = false;
    controls.enablePan = false;
    controls.maxPolarAngle = Math.PI / 2;
    updateCamera();

    const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
    scene.add(ambientLight);

    try {
        clickSound = new Audio('/assets/click.wav');
        winSound = new Audio('/assets/wins.wav');
        loseSound = new Audio('/assets/lose.mp3');
        tieSound = new Audio('/assets/tie.wav');
    } catch (e) {}

    createBoard();
    setupEventListeners();
    updateScoreDisplay();

    const savedGame = savedData.gameState;
    if (savedGame && isValidGameState(savedGame)) {
        board = savedGame.board;
        currentPlayer = savedGame.currentPlayer;
        vsComputer = savedGame.vsComputer;
        difficulty = savedGame.difficulty;
        gameActive = savedGame.gameActive;
        winningLine = savedGame.winningLine;
        document.getElementById('menu').classList.add('hidden');
        document.getElementById('game').classList.remove('hidden');
        document.getElementById('game-status').textContent = gameActive ? `${currentPlayer}'s turn` : (winningLine ? `${currentPlayer} wins!` : "It's a tie!");
        updateScoreDisplay();
        board.forEach((player, index) => {
            if (player) {
                const pos = cells[index]?.position;
                if (pos) createMarker(player, pos, index);
            }
        });
        if (winningLine) highlightWinningLine(winningLine);
    }

    window.addEventListener('resize', onWindowResize);
    window.addEventListener('orientationchange', onWindowResize);
    animate();
}

function updateRendererSize() {
    const canvas = renderer.domElement;
    const container = canvas.parentElement || document.body;
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    renderer.setSize(width, height, false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    camera.left = width / -20;
    camera.right = width / 20;
    camera.top = height / 20;
    camera.bottom = height / -20;
    camera.updateProjectionMatrix();
}

function updateCamera() {
    const isMobile = window.innerWidth <= 768 || window.innerHeight <= 768;
    const zoomFactor = isMobile ? 15 : 12;
    camera.position.set(0, zoomFactor, 0);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    controls.update();
}

function setupEventListeners() {
    const elements = {
        quickplay: () => startGame(false),
        vscomputer: () => startGame(true),
        settings: showSettings,
        'how-to-play-btn': showHowToPlay,
        back: showMainMenu,
        'back-to-menu': showMainMenu,
        'back-from-how-to-play': showMainMenu,
        'new-game': restartGame,
        'reset-scores': resetScores
    };
    for (const [id, handler] of Object.entries(elements)) {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('click', handler);
            el.addEventListener('touchend', (e) => { e.preventDefault(); handler(); });
        }
    }

    const difficultySelect = document.getElementById('difficulty');
    if (difficultySelect) {
        difficultySelect.addEventListener('change', (e) => {
            difficulty = e.target.value;
            saveData();
        });
        difficultySelect.value = difficulty;
    }

    const canvas = document.getElementById('canvas');
    if (canvas) {
        canvas.addEventListener('mousemove', onMouseMove);
        canvas.addEventListener('click', onCanvasClick);
        canvas.addEventListener('touchstart', onCanvasTouch, { passive: false });
        canvas.addEventListener('touchmove', onTouchMove, { passive: false });
        canvas.addEventListener('touchend', () => { isTouching = false; });
    }
}

function createBoard() {
    cells.forEach(cell => {
        scene.remove(cell);
        if (cell.geometry) cell.geometry.dispose();
        if (cell.material) cell.material.dispose();
    });
    cells = [];

    scene.children.forEach(child => {
        if (child.isLineSegments || child.isMesh) {
            scene.remove(child);
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        }
    });

    const isMobile = window.innerWidth <= 768 || window.innerHeight <= 768;
    const boardScaleFactor = Math.min(Math.max(window.innerWidth, window.innerHeight) / 400, 6.0);
    const spacing = 2.5 * boardScaleFactor;

    const boardGeometry = new THREE.PlaneGeometry(7.5 * boardScaleFactor, 7.5 * boardScaleFactor);
    const boardMaterial = new THREE.MeshBasicMaterial({ color: 0xf5f5dc });
    const boardBase = new THREE.Mesh(boardGeometry, boardMaterial);
    boardBase.position.y = 0.01;
    scene.add(boardBase);

    const cellGeometry = new THREE.PlaneGeometry(2.4 * boardScaleFactor, 2.4 * boardScaleFactor);
    const cellMaterial = new THREE.MeshBasicMaterial({ visible: false });

    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
            const cell = new THREE.Mesh(cellGeometry, cellMaterial.clone());
            const x = (i - 1) * spacing;
            const z = (j - 1) * spacing;
            cell.position.set(x, 0.01, z);
            cell.rotation.x = -Math.PI / 2;
            cell.userData = { index: i * 3 + j };
            scene.add(cell);
            cells.push(cell);

            const hoverGeometry = new THREE.PlaneGeometry(2.4 * boardScaleFactor, 2.4 * boardScaleFactor);
            const hoverMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, opacity: 0.1, transparent: true, visible: false });
            const hoverPlane = new THREE.Mesh(hoverGeometry, hoverMaterial);
            hoverPlane.position.set(x, 0.012, z);
            hoverPlane.rotation.x = -Math.PI / 2;
            hoverPlane.userData = { index: i * 3 + j };
            scene.add(hoverPlane);
            cell.userData.hoverPlane = hoverPlane;
        }
    }

    const lineThickness = 0.3 * boardScaleFactor;
    const lineMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });

    const hLineGeometry1 = new THREE.PlaneGeometry(3.0 * spacing, lineThickness);
    const hLine1 = new THREE.Mesh(hLineGeometry1, lineMaterial);
    hLine1.position.set(0, 0.015, -0.5 * spacing);
    hLine1.rotation.x = -Math.PI / 2;
    scene.add(hLine1);

    const hLineGeometry2 = new THREE.PlaneGeometry(3.0 * spacing, lineThickness);
    const hLine2 = new THREE.Mesh(hLineGeometry2, lineMaterial);
    hLine2.position.set(0, 0.015, 0.5 * spacing);
    hLine2.rotation.x = -Math.PI / 2;
    scene.add(hLine2);

    const vLineGeometry1 = new THREE.PlaneGeometry(lineThickness, 3.0 * spacing);
    const vLine1 = new THREE.Mesh(vLineGeometry1, lineMaterial);
    vLine1.position.set(-0.5 * spacing, 0.015, 0);
    vLine1.rotation.x = -Math.PI / 2;
    scene.add(vLine1);

    const vLineGeometry2 = new THREE.PlaneGeometry(lineThickness, 3.0 * spacing);
    const vLine2 = new THREE.Mesh(vLineGeometry2, lineMaterial);
    vLine2.position.set(0.5 * spacing, 0.015, 0);
    vLine2.rotation.x = -Math.PI / 2;
    scene.add(vLine2);
}

function onCanvasClick(event) {
    event.preventDefault();
    const canvas = renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    raycaster.params.Mesh.threshold = window.innerWidth <= 768 ? 2.5 : 1.5;
    const intersects = raycaster.intersectObjects(cells);

    if (intersects.length > 0 && gameActive) {
        const index = intersects[0].object.userData.index;
        makeMove(index);
    }
}

function onCanvasTouch(event) {
    if (isTouching) return;
    isTouching = true;
    setTimeout(() => { isTouching = false; }, 200);

    if (event.cancelable) {
        event.preventDefault();
    }

    const touch = event.touches[0];
    const canvas = renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((touch.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((touch.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    raycaster.params.Mesh.threshold = window.innerWidth <= 768 ? 2.5 : 1.5;
    const intersects = raycaster.intersectObjects(cells);

    if (intersects.length > 0 && gameActive) {
        const index = intersects[0].object.userData.index;
        makeMove(index);
    }
}

function onTouchMove(event) {

    if (event.cancelable) {
        event.preventDefault();
    }

    const touch = event.touches[0];
    const canvas = renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((touch.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((touch.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    raycaster.params.Mesh.threshold = window.innerWidth <= 768 ? 2.5 : 1.5;
    const intersects = raycaster.intersectObjects(cells);
    updateHoverEffect(intersects);
}

function onMouseMove(event) {
    const canvas = renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    raycaster.params.Mesh.threshold = window.innerWidth <= 768 ? 2.5 : 1.5;
    const intersects = raycaster.intersectObjects(cells);
    updateHoverEffect(intersects);
}

function updateHoverEffect(intersects) {
    if (hoveredCell) {
        hoveredCell.userData.hoverPlane.material.visible = false;
        hoveredCell = null;
    }

    if (intersects.length > 0 && gameActive) {
        const cell = intersects[0].object;
        const index = cell.userData.index;
        if (!board[index]) {
            hoveredCell = cell;
            hoveredCell.userData.hoverPlane.material.visible = true;
        }
    }
}

function createMarker(type, position, index) {
    if (!position || typeof position.x !== 'number' || typeof position.z !== 'number') return;
    const isMobile = window.innerWidth <= 768 || window.innerHeight <= 768;
    const markerScaleFactor = isMobile ? 3.0 : 4.5;
    const lineWidth = isMobile ? 0.1 : 0.15;
    const material = new THREE.LineBasicMaterial({ color: type === 'Player 1' ? 0xff0000 : 0x0000ff, linewidth: lineWidth });

    let marker;
    if (type === 'Player 1') {
        const size = 1.0 * markerScaleFactor;
        const geometry1 = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(-size / 2, 0, -size / 2),
            new THREE.Vector3(size / 2, 0, size / 2)
        ]);
        const geometry2 = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(size / 2, 0, -size / 2),
            new THREE.Vector3(-size / 2, 0, size / 2)
        ]);
        const geometries = [geometry1, geometry2];
        const mergedGeometry = BufferGeometryUtils.mergeGeometries(geometries);
        marker = new THREE.LineSegments(mergedGeometry, material);
    } else {
        const radius = 0.5 * markerScaleFactor;
        const segments = 32;
        const points = [];
        for (let i = 0; i <= segments; i++) {
            const theta = (i / segments) * Math.PI * 2;
            points.push(new THREE.Vector3(Math.cos(theta) * radius, 0, Math.sin(theta) * radius));
        }
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        marker = new THREE.LineLoop(geometry, material);
    }

    marker.position.set(position.x, 0.01, position.z);
    marker.rotation.x = -Math.PI / 4;
    marker.userData = { index };
    scene.add(marker);
    markers.push(marker);

    if (clickSound) clickSound.play().catch(() => {});
}

function highlightWinningLine(combo) {
    const isMobile = window.innerWidth <= 768 || window.innerHeight <= 768;
    const boardScaleFactor = Math.min(Math.max(window.innerWidth, window.innerHeight) / 400, 6.0);
    const spacing = 2.5 * boardScaleFactor;
    const lineWidth = isMobile ? 0.2 : 0.3;
    const material = new THREE.LineBasicMaterial({ color: 0xffff00, linewidth: lineWidth });

    const startCell = cells[combo[0]].position;
    const endCell = cells[combo[2]].position;
    const points = [
        new THREE.Vector3(startCell.x, 0.02, startCell.z),
        new THREE.Vector3(endCell.x, 0.02, endCell.z)
    ];
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.Line(geometry, material);
    scene.add(line);
    markers.push(line);
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
        if (!data.scores || !data.settings) return defaultData;
        if (!['easy', 'medium', 'hard'].includes(data.settings.difficulty)) {
            data.settings.difficulty = 'medium';
        }
        return data;
    } catch (e) {
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
    } catch (e) {}
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
            winSound.play().catch(() => {});
        } else if (winner === 'Player 2' && loseSound) {
            loseSound.play().catch(() => {});
        }
    } else {
        scores['Ties']++;
        saveData();
        const scoreTies = document.getElementById('score-ties');
        if (scoreTies) scoreTies.textContent = `Ties: ${scores['Ties']}`;
        if (tieSound) tieSound.play().catch(() => {});
    }
}

function showHowToPlay() {
    const menu = document.getElementById('menu');
    const howToPlay = document.getElementById('how-to-play');
    const canvas = document.getElementById('canvas');
    if (menu && howToPlay) {
        menu.classList.add('hidden');
        howToPlay.classList.remove('hidden');
        if (canvas) canvas.style.display = 'none';
    }
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
    if (menu && settingsMenu && howToPlay && game) {
        menu.classList.add('hidden');
        settingsMenu.classList.add('hidden');
        howToPlay.classList.add('hidden');
        game.classList.remove('hidden');
    }
    const gameStatus = document.getElementById('game-status');
    if (gameStatus) gameStatus.textContent = `${currentPlayer}'s turn`;

    markers.forEach(marker => {
        scene.remove(marker);
        if (marker.geometry) marker.geometry.dispose();
        if (marker.material) marker.material.dispose();
    });
    markers = [];
    updateScoreDisplay();
    saveData();
    createBoard();

    if (vsComputer && currentPlayer === 'Player 2') {
        setTimeout(computerMove, 300);
    }
}

function restartGame() {
    board = Array(9).fill(null);
    currentPlayer = 'Player 1';
    gameActive = true;
    winningLine = null;
    const gameStatus = document.getElementById('game-status');
    if (gameStatus) gameStatus.textContent = `${currentPlayer}'s turn`;

    markers.forEach(marker => {
        scene.remove(marker);
        if (marker.geometry) marker.geometry.dispose();
        if (marker.material) marker.material.dispose();
    });
    markers = [];
    updateScoreDisplay();
    saveData();
    createBoard();

    if (vsComputer && currentPlayer === 'Player 2') {
        setTimeout(computerMove, 300);
    }
}

function makeMove(index) {
    if (board[index] || !gameActive) return;

    board[index] = currentPlayer;
    const pos = cells[index]?.position;
    if (pos) {
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
            setTimeout(computerMove, 300);
        }
    }
}

function computerMove() {
    let move;
    if (difficulty === 'easy') {
        move = getRandomMove();
    } else if (difficulty === 'medium') {
        move = getBestMove(0.7);
    } else {
        move = getBestMove(1);
    }

    if (move !== null) makeMove(move);
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
            { index: 0, combos: [[0, 1, 2], [0, 3, 6], [0, 4, 8]] },
            { index: 2, combos: [[0, 1, 2], [2, 5, 8], [2, 4, 6]] },
            { index: 6, combos: [[6, 7, 8], [0, 3, 6], [0, 4, 8]] },
            { index: 8, combos: [[6, 7, 8], [2, 5, 8], [0, 4, 8]] },
            { index: 4, combos: [[1, 4, 7], [3, 4, 5], [0, 4, 8], [2, 4, 6]] }
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
    if (menu && settingsMenu) {
        menu.classList.add('hidden');
        settingsMenu.classList.remove('hidden');
    }
}

function showMainMenu() {
    const game = document.getElementById('game');
    const settingsMenu = document.getElementById('settings-menu');
    const howToPlay = document.getElementById('how-to-play');
    const menu = document.getElementById('menu');
    if (game && settingsMenu && howToPlay && menu) {
        game.classList.add('hidden');
        settingsMenu.classList.add('hidden');
        howToPlay.classList.add('hidden');
        menu.classList.remove('hidden');
    }
    saveData();
}

function onWindowResize() {
    updateRendererSize();
    updateCamera();
    createBoard();
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

init();