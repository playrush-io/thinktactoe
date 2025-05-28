import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { gsap } from 'gsap';
import './styles.css';

let scene, camera, renderer, controls, composer;
let board = Array(9).fill(null);
let currentPlayer = 'Player 1';
let gameActive = true;
let vsComputer = false;
let difficulty = 'medium';
let cells = [];
let markers = [];
let particles = [];
let raycaster = new THREE.Raycaster();
let mouse = new THREE.Vector2();
let clickSound, winSound, loseSound, tieSound, spinSound;
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

    const requiredElements = ['quickplay', 'vscomputer', 'multiplayer', 'settings', 'how-to-play-btn', 'back', 'back-to-menu', 'new-game', 'difficulty', 'reset-scores', 'canvas', 'menu', 'game', 'settings-menu', 'how-to-play', 'back-from-how-to-play', 'game-status', 'score-player1', 'score-player2', 'score-ties'];
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
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);
    const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        0.3, // strength
        0.4, // radius
        0.9 // threshold
    );
    composer.addPass(bloomPass);

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
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 1024;
    directionalLight.shadow.mapSize.height = 1024;
    scene.add(directionalLight);
    const pointLight = new THREE.PointLight(0xffffff, 0.5, 20);
    pointLight.position.set(0, 8, 0);
    scene.add(pointLight);

    const rgbeLoader = new RGBELoader();
    rgbeLoader.load('/assets/studio_small_04_1k.hdr', (texture) => {
        texture.mapping = THREE.EquirectangularReflectionMapping;
        scene.environment = texture;
        console.log('HDR texture loaded');
    }, undefined, (err) => {
        console.error('Failed to load HDR:', err.message);
    });

    clickSound = new Audio('/assets/click.wav');
    winSound = new Audio('/assets/wins.wav');
    loseSound = new Audio('/assets/lose.mp3');
    tieSound = new Audio('/assets/tie.wav');
    spinSound = new Audio('/assets/spin.mp3');

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

    const textureLoader = new THREE.TextureLoader();
    const woodTexture = textureLoader.load(
        '/assets/cartoon-style-wood-texture/882.jpg',
        () => console.log('Wood texture loaded'),
        undefined,
        (err) => console.error('Failed to load wood texture:', err.message)
    );
    const woodNormal = textureLoader.load(
        '/assets/cartoon-style-wood-texture/882_normal.jpg',
        () => console.log('Wood normal map loaded'),
        undefined,
        (err) => console.error('Failed to load wood normal map:', err.message)
    );
    const cellNormal = textureLoader.load(
        '/assets/concrete_normal.jpg',
        () => console.log('Cell normal map loaded'),
        undefined,
        (err) => console.error('Failed to load cell normal map:', err.message)
    );

    const boardScaleFactor = 5.0;
    const cellScaleFactor = 6.0;
    const boardGeometry = new THREE.BoxGeometry(6 * boardScaleFactor, 0.4, 6 * boardScaleFactor, 32, 32, 32, { bevelEnabled: true, bevelSegments: 4, bevelSize: 0.05 });
    const boardMaterial = new THREE.MeshStandardMaterial({ 
        map: woodTexture, 
        normalMap: woodNormal,
        normalScale: new THREE.Vector2(1.5, 1.5),
        roughness: 0.5, 
        metalness: 0.05,
        emissive: 0x222222,
        emissiveIntensity: 0.05
    });
    boardBase = new THREE.Mesh(boardGeometry, boardMaterial);
    boardBase.receiveShadow = true;
    scene.add(boardBase);

    const cellGeometry = new THREE.BoxGeometry(0.9 * cellScaleFactor, 0.1, 0.9 * cellScaleFactor);
    const cellMaterial = new THREE.MeshStandardMaterial({ 
        roughness: 0.7, 
        metalness: 0.1,
        normalMap: cellNormal,
        normalScale: new THREE.Vector2(0.5, 0.5),
        emissive: 0x222222,
        emissiveIntensity: 0.1
    });

    const spacing = 1.8 * boardScaleFactor;
    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
            const cell = new THREE.Mesh(cellGeometry, cellMaterial.clone());
            cell.position.set((i - 1) * spacing, 0.5, (j - 1) * spacing);
            cell.userData = { index: i * 3 + j, baseColor: 0x999999 };
            cell.receiveShadow = true;
            scene.add(cell);
            cells.push(cell);
        }
    }

    const textureLoaderLine = new THREE.TextureLoader();
    const lineTexture = textureLoaderLine.load(
        '/assets/spark.png',
        () => console.log('Line spark texture loaded'),
        undefined,
        (err) => console.error('Failed to load line spark texture:', err.message)
    );
    const lineMaterial = new THREE.LineBasicMaterial({ 
        map: lineTexture,
        color: 0x00ffff,
        transparent: true,
        opacity: 0.9
    });
    const points = [];
    for (let i = 0; i <= 3; i++) {
        const x = i * spacing - 1.5 * spacing / 2;
        points.push(new THREE.Vector3(x, 0.45, -1.5 * spacing / 2));
        points.push(new THREE.Vector3(x, 0.45, 1.5 * spacing / 2));
    }
    for (let j = 0; j <= 3; j++) {
        const z = j * spacing - 1.5 * spacing / 2;
        points.push(new THREE.Vector3(-1.5 * spacing / 2, 0.45, z));
        points.push(new THREE.Vector3(1.5 * spacing / 2, 0.45, z));
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
    const textureLoader = new THREE.TextureLoader();
    let metalTexture, metalNormal;

    metalTexture = textureLoader.load(
        '/assets/Poliigon_StoneQuartzite_8060/2K/Poliigon_StoneQuartzite_8060_BaseColor.jpg',
        () => console.log('Quartzite texture loaded'),
        undefined,
        (err) => console.error('Failed to load quartzite texture:', err.message)
    );

    metalNormal = textureLoader.load(
        '/assets/Poliigon_StoneQuartzite_8060/2K/Poliigon_StoneQuartzite_8060_normal.jpg',
        () => console.log('Quartzite normal map loaded'),
        undefined,
        (err) => {
            console.warn('Failed to load quartzite normal map:', err.message);
            metalNormal = textureLoader.load('/assets/concrete_normal.jpg', () => console.log('Fallback normal map loaded'));
        }
    );

    const markerScaleFactor = 4.0;
    let geometry, material, marker;

    if (type === 'Player 1') {
        const box1 = new THREE.BoxGeometry(0.8 * markerScaleFactor, 0.15, 0.15);
        const box2 = new THREE.BoxGeometry(0.8 * markerScaleFactor, 0.15, 0.15);
        const mesh1 = new THREE.Mesh(box1);
        const mesh2 = new THREE.Mesh(box2);
        mesh2.rotation.z = Math.PI / 2;
        geometry = new THREE.BufferGeometry();
        const merged = (BufferGeometryUtils.mergeGeometries || BufferGeometryUtils.mergeBufferGeometries)([mesh1.geometry, mesh2.geometry]);
        geometry.copy(merged);
        material = new THREE.MeshStandardMaterial({
            map: metalTexture,
            normalMap: metalNormal,
            normalScale: new THREE.Vector2(1.2, 1.2),
            roughness: 0.2,
            metalness: 0.95,
            emissive: 0x000000,
            emissiveIntensity: 0.4,
            transparent: false
        });
    } else {
        geometry = new THREE.RingGeometry(0.3 * markerScaleFactor, 0.5 * markerScaleFactor, 32);
        material = new THREE.MeshStandardMaterial({
            map: metalTexture,
            normalMap: metalNormal,
            normalScale: new THREE.Vector2(1.2, 1.2),
            roughness: 0.2,
            metalness: 0.95,
            emissive: 0x5555ff,
            emissiveIntensity: 0.6,
            transparent: false
        });
    }

    marker = new THREE.Mesh(geometry, material);
    marker.position.set(position.x, 2.5, position.z);
    marker.rotation.x = Math.PI / 2;
    marker.castShadow = true;
    marker.receiveShadow = true;
    marker.userData = { index };

    if (type !== 'Player 1') {
        const outlineGeometry = new THREE.RingGeometry(0.31 * markerScaleFactor, 0.51 * markerScaleFactor, 32);
        const outlineMaterial = new THREE.MeshBasicMaterial({
            color: 0x000000,
            side: THREE.BackSide,
            transparent: false
        });
        const outline = new THREE.Mesh(outlineGeometry, outlineMaterial);
        outline.scale.set(1.05, 1.05, 1.05);
        marker.add(outline);
        console.log('Player 2 outline added');
    }

    scene.add(marker);
    markers.push(marker);
    console.log(`${type} marker added to scene:`, marker);

    gsap.to(marker.position, { y: 0.55, duration: 1.2, ease: "bounce.out" });
    gsap.to(marker.rotation, { z: Math.PI * 2, duration: 1.2, ease: "power2.out" });
    gsap.to(marker.scale, { x: 1.5, y: 1.5, z: 1.5, duration: 0.6, yoyo: true, repeat: 2, ease: "elastic.out(1, 0.3)" });

    createParticleBurst(position, type === 'Player 1' ? 0x000000 : 0x5555ff);

    if (clickSound) clickSound.play().catch(e => console.warn('Click sound play error:', e));
}

function createParticleBurst(position, color) {
    const particleCount = 10;
    const particleScaleFactor = 4.0;
    const textureLoader = new THREE.TextureLoader();
    const sparkTexture = textureLoader.load(
        '/assets/spark.png',
        () => console.log('Spark texture loaded'),
        undefined,
        (err) => console.error('Failed to load spark texture:', err.message)
    );
    const geometry = new THREE.PlaneGeometry(0.1 * particleScaleFactor, 0.1 * particleScaleFactor);

    for (let i = 0; i < particleCount; i++) {
        const material = new THREE.MeshBasicMaterial({
            map: sparkTexture,
            color: color,
            transparent: true,
            blending: THREE.AdditiveBlending
        });
        const particle = new THREE.Mesh(geometry, material);
        particle.position.copy(position);
        particle.position.y = 0.65;
        particle.rotation.z = Math.random() * Math.PI * 2;
        particle.scale.setScalar(0.08 * particleScaleFactor + Math.random() * 0.04);
        scene.add(particle);
        particles.push(particle);

        const velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 0.2 * particleScaleFactor,
            Math.random() * 0.2 * particleScaleFactor,
            (Math.random() - 0.5) * 0.2 * particleScaleFactor
        );

        gsap.to(particle.position, {
            x: particle.position.x + velocity.x * 2,
            y: particle.position.y + velocity.y * 2,
            z: particle.position.z + velocity.z * 2,
            duration: 0.8,
            ease: "power2.out",
            onComplete: () => {
                scene.remove(particle);
                particles = particles.filter(p => p !== particle);
            }
        });
        gsap.to(particle, {
            opacity: 0,
            duration: 0.8,
            ease: "power2.out"
        });
    }
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
    const scoreDisplay = document.getElementById('score-display');
    if (scoreDisplay) {
        gsap.to(scoreDisplay, {
            scale: 1.3,
            duration: 0.7,
            ease: "elastic.out(1, 0.3)",
            onComplete: () => gsap.to(scoreDisplay, { scale: 1, duration: 0.3 })
        });
    }
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
        if (scoreElement) {
            scoreElement.textContent = `${winner}: ${scores[winner]}`;
            gsap.to(scoreElement, {
                scale: 1.3,
                duration: 0.7,
                ease: "elastic.out(1, 0.3)",
                onComplete: () => gsap.to(scoreElement, { scale: 1, duration: 0.3 })
            });
        }
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
        if (scoreTies) {
            scoreTies.textContent = `Ties: ${scores['Ties']}`;
            gsap.to(scoreTies, {
                scale: 1.3,
                duration: 0.7,
                ease: "elastic.out(1, 0.3)",
                onComplete: () => gsap.to(scoreTies, { scale: 1, duration: 0.3 })
            });
        }
        if (tieSound) {
            tieSound.pause();
            tieSound.currentTime = 0;
            tieSound.play().catch(e => console.warn('Tie sound play error:', e));
        }
    }
    if (!gameActive) {
        saveData();
    }
}

function highlightWinningLine(combo) {
    combo.forEach(index => {
        const cell = cells[index];
        cell.material.emissive.setHex(currentPlayer === 'Player 1' ? 0x000000 : 0x5555ff);
        cell.material.emissiveIntensity = 1.0;
        gsap.to(cell.material, {
            emissiveIntensity: 0.5,
            duration: 0.6,
            yoyo: true,
            repeat: -1,
            ease: "sine.inOut"
        });
    });
}

function onMouseMove(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(cells);

    cells.forEach(cell => {
        cell.material.emissive.setHex(cell.userData.baseColor);
        cell.material.emissiveIntensity = 0.1;
    });

    if (intersects.length > 0 && gameActive && !board[intersects[0].object.userData.index]) {
        const cell = intersects[0].object;
        cell.material.emissive.setHex(currentPlayer === 'Player 1' ? 0x000000 : 0x5555ff);
        cell.material.emissiveIntensity = 1.0;
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
    if (gameStatus) {
        gameStatus.textContent = `${currentPlayer}'s turn`;
        gsap.to(gameStatus, {
            scale: 1.3,
            color: currentPlayer === 'Player 1' ? '#000000' : '#5555ff',
            duration: 0.5,
            ease: "elastic.out(1, 0.3)",
            onComplete: () => gsap.to(gameStatus, { scale: 1, duration: 0.3 })
        });
    }

    markers.forEach(marker => scene.remove(marker));
    particles.forEach(particle => scene.remove(particle));
    markers = [];
    particles = [];
    cells.forEach(cell => {
        cell.material.emissive.set(0x222222);
        cell.material.emissiveIntensity = 0.1;
    });
    updateScoreDisplay();
    saveData();

    if (vsComputer && currentPlayer === 'Player 2') {
        setTimeout(computerMove, 1000);
    }
}

function restartGame() {
    if (boardBase) {
        if (spinSound) {
            spinSound.pause();
            spinSound.currentTime = 0;
            spinSound.play().catch(e => console.warn('Spin sound play error:', e));
        }
        gsap.to(boardBase.rotation, {
            y: "+=6.2832",
            duration: 5,
            ease: "power2.inOut",
            onComplete: () => {
                boardBase.rotation.y = 0;
                if (spinSound) {
                    spinSound.pause();
                    spinSound.currentTime = 0;
                }
                completeRestart();
            }
        });
    } else {
        completeRestart();
    }
}

function completeRestart() {
    board = Array(9).fill(null);
    currentPlayer = 'Player 1';
    gameActive = true;
    winningLine = null;
    const gameStatus = document.getElementById('game-status');
    if (gameStatus) {
        gameStatus.textContent = `${currentPlayer}'s turn`;
        gsap.to(gameStatus, {
            scale: 1.3,
            color: '#000000',
            duration: 0.5,
            ease: "elastic.out(1, 0.3)",
            onComplete: () => gsap.to(gameStatus, { scale: 1, duration: 0.3 })
        });
    }

    markers.forEach(marker => scene.remove(marker));
    particles.forEach(particle => scene.remove(particle));
    markers = [];
    particles = [];
    cells.forEach(cell => {
        cell.material.emissive.set(0x222222);
        cell.material.emissiveIntensity = 0.1;
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
        if (gameStatus) {
            gameStatus.textContent = `${currentPlayer} wins!`;
            gsap.to(gameStatus, {
                scale: 1.3,
                color: currentPlayer === 'Player 1' ? '#000000' : '#5555ff',
                duration: 0.5,
                ease: "elastic.out(1, 0.3)",
                onComplete: () => gsap.to(gameStatus, { scale: 1, duration: 0.3 })
            });
        }
        gameActive = false;
        winningLine = winCombo;
        highlightWinningLine(winCombo);
        updateScore(currentPlayer);
        return;
    }

    if (board.every(cell => cell)) {
        const gameStatus = document.getElementById('game-status');
        if (gameStatus) {
            gameStatus.textContent = "It's a tie!";
            gsap.to(gameStatus, {
                scale: 1.3,
                color: '#ffffff',
                duration: 0.5,
                ease: "elastic.out(1, 0.3)",
                onComplete: () => gsap.to(gameStatus, { scale: 1, duration: 0.3 })
            });
        }
        gameActive = false;
        updateScore(null);
        return;
    }

    currentPlayer = currentPlayer === 'Player 1' ? 'Player 2' : 'Player 1';
    const gameStatus = document.getElementById('game-status');
    if (gameStatus) {
        gameStatus.textContent = `${currentPlayer}'s turn`;
        gsap.to(gameStatus, {
            scale: 1.3,
            color: currentPlayer === 'Player 1' ? '#000000' : '#5555ff',
            duration: 0.5,
            ease: "elastic.out(1, 0.3)",
            onComplete: () => gsap.to(gameStatus, { scale: 1, duration: 0.3 })
        });
    }
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
    composer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    composer.render();
}

init();