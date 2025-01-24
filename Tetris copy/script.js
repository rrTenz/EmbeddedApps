const canvas = document.getElementById('tetris');
const context = canvas.getContext('2d');
let scale = 20; // Default scale, will be updated for responsiveness
let rows = 20;
let cols = 10;

// Responsive Canvas
function resizeCanvas() {
    const containerWidth = document.querySelector('.container').clientWidth;
    scale = Math.floor(containerWidth / cols);
    canvas.width = cols * scale;
    canvas.height = rows * scale;
    context.scale(scale, scale);
}

window.addEventListener('resize', () => {
    // Reset the transformation before resizing
    context.setTransform(1, 0, 0, 1, 0, 0);
    resizeCanvas();
    context.scale(scale, scale);
    draw(); // Redraw the game after resizing
});

resizeCanvas();

let arena = createMatrix(cols, rows);
let score = 0;
let highScore = localStorage.getItem('tetrisHighScore') || 0;
document.getElementById('high-score').innerText = highScore;

// One-time reset to clear the high score
//localStorage.setItem('tetrisHighScore', 0);  // This will reset the high score to 0
//document.getElementById('high-score').innerText = 0;

let player = {
    pos: {x: 0, y: 0},
    matrix: null,
    score: 0
};

const pieces = 'ILJOTSZ';
const colors = ['cyan', 'blue', 'orange', 'yellow', 'green', 'purple', 'red'];

// Sound Effects
const moveSound = new Audio('sounds/move.wav');
moveSound.preload = 'auto';
const rotateSound = new Audio('sounds/move.wav');
rotateSound.preload = 'auto';
const dropSound = new Audio('sounds/rotate.wav');
dropSound.preload = 'auto';
const clearSound = new Audio('sounds/clear.wav');
clearSound.preload = 'auto';
const gameOverSound = new Audio('sounds/gameover.wav');
gameOverSound.preload = 'auto';

//Next Piece
let nextPiece = createPiece(pieces[Math.floor(Math.random() * pieces.length)]);
let showNextPiece = true; // Track if the next piece window is shown

const nextPieceCanvas = document.getElementById('next-piece');
const nextPieceContext = nextPieceCanvas.getContext('2d');


function createMatrix(w, h) {
    const matrix = [];
    while (h--) {
        matrix.push(new Array(w).fill(0));
    }
    return matrix;
}

function createPiece(type) {
    switch (type) {
        case 'T':
            return [
                [0, 6, 0],
                [6, 6, 6],
                [0, 0, 0],
            ];
        case 'O':
            return [
                [4, 4],
                [4, 4],
            ];
        case 'L':
            return [
                [0, 0, 2],
                [2, 2, 2],
                [0, 0, 0],
            ];
        case 'J':
            return [
                [3, 0, 0],
                [3, 3, 3],
                [0, 0, 0],
            ];
        case 'I':
            return [
                [0, 0, 0, 0],
                [1, 1, 1, 1],
                [0, 0, 0, 0],
                [0, 0, 0, 0],
            ];
        case 'S':
            return [
                [0, 5, 5],
                [5, 5, 0],
                [0, 0, 0],
            ];
        case 'Z':
            return [
                [7, 7, 0],
                [0, 7, 7],
                [0, 0, 0],
            ];
    }
}


function drawMatrix(matrix, offset) {
    if (!matrix || matrix.length === 0) return; // Safeguard if matrix is undefined or empty
    matrix.forEach((row, y) => {
        row.forEach((value, x) => {
            if (value !== 0) {
                context.fillStyle = colors[value - 1];
                context.fillRect(x + offset.x, y + offset.y, 1, 1);
            }
        });
    });
}

function drawGrid() {
    context.strokeStyle = '#333';  // Grid color
    context.lineWidth = 0.05;  // Make lines thin
    for (let x = 0; x < cols; x++) {
        for (let y = 0; y < rows; y++) {
            context.strokeRect(x, y, 1, 1);  // Draw a 1x1 square for each cell
        }
    }
}

function drawNextPiece() {
    if (!showNextPiece) return;

    nextPieceContext.clearRect(0, 0, nextPieceCanvas.width, nextPieceCanvas.height);
    nextPieceContext.scale(20, 20); // Scale next piece canvas for better view

    nextPiece.forEach((row, y) => {
        row.forEach((value, x) => {
            if (value !== 0) {
                nextPieceContext.fillStyle = colors[value - 1];
                nextPieceContext.fillRect(x, y, 1, 1);
            }
        });
    });

    nextPieceContext.setTransform(1, 0, 0, 1, 0, 0); // Reset transformation
}

function merge(arena, player) {
    player.matrix.forEach((row, y) => {
        row.forEach((value, x) => {
            if (value !== 0) {
                arena[y + player.pos.y][x + player.pos.x] = value;
            }
        });
    });
}

function collide(arena, player) {
    const [matrix, offset] = [player.matrix, player.pos];
    for (let y = 0; y < matrix.length; ++y) {
        for (let x = 0; x < matrix[y].length; ++x) {
            if (matrix[y][x] !== 0 &&
               (arena[y + offset.y] &&
                arena[y + offset.y][x + offset.x]) !== 0) {
                return true;
            }
        }
    }
    return false;
}

function rotate(matrix, dir) {
    const transposedMatrix = matrix.map((row, y) =>
        row.map((val, x) => matrix[x][y])
    );

    // Reverse the rows for clockwise rotation
    if (dir > 0) {
        transposedMatrix.forEach(row => row.reverse());
    } else {
        transposedMatrix.reverse();
    }
    
    rotateSound.play();

    return transposedMatrix;
}

function playerRotate(dir) {
    const originalMatrix = player.matrix;
    const rotatedMatrix = rotate(player.matrix, dir);
    const originalPosX = player.pos.x;
    const kickOffsets = [-1, 1, -2, 2]; // Try shifting left and right up to 2 spaces

    // Attempt to rotate the piece
    player.matrix = rotatedMatrix;

    // If there's a collision after rotation, try wall kicks
    if (collide(arena, player)) {
        for (let offset of kickOffsets) {
            player.pos.x = originalPosX + offset;
            if (!collide(arena, player)) {
                return; // Successfully rotated and kicked
            }
        }

        // If no valid position is found, revert to original state
        player.pos.x = originalPosX;
        player.matrix = originalMatrix;
    }
}

function playerMove(dir) {
    player.pos.x += dir;
    if (collide(arena, player)) {
        player.pos.x -= dir;
    } else {
        moveSound.play();
    }
}

function playerDrop() {
    player.pos.y++;
    if (collide(arena, player)) {
        player.pos.y--;
        merge(arena, player);
        dropSound.play();
        playerReset();
        arenaSweep();
    }
    dropCounter = 0;
}

let scoreMultiplier = 1;

function adjustScoreMultiplier() {
    scoreMultiplier = showNextPiece ? 1 : 1.15;
}

function arenaSweep() {
    let rowCount = 1;
    outer: for (let y = arena.length - 1; y > 0; --y) {
        for (let x = 0; x < arena[y].length; ++x) {
            if (arena[y][x] === 0) {
                continue outer;
            }
        }

        const row = arena.splice(y, 1)[0].fill(0);
        arena.unshift(row);
        player.score += rowCount * 10 * scoreMultiplier;
        rowCount *= 2;

        clearSound.play();

        if (player.score > highScore) {
            highScore = player.score;
            localStorage.setItem('tetrisHighScore', highScore);
            document.getElementById('high-score').innerText = highScore;
        }

        y++;
    }
    document.getElementById('score').innerText = player.score;
}

function playerReset() {
    player.matrix = nextPiece;
    player.pos.y = 0;
    player.pos.x = (arena[0].length / 2 | 0) - (player.matrix[0].length / 2 | 0);

    nextPiece = createPiece(pieces[Math.floor(Math.random() * pieces.length)]);
    drawNextPiece();

    if (collide(arena, player)) {
        gameOver();
    }
}

let dropCounter = 0;
let dropInterval = 1000; // Initial drop interval in ms
let lastTime = 0;
let isPaused = false;

// Game Over Elements
const gameOverOverlay = document.getElementById('game-over');
const finalScoreEl = document.getElementById('final-score');
const restartBtn = document.getElementById('restart-btn');

// Pause Button
const pauseBtn = document.getElementById('pause-btn');

// Game Loop
function update(time = 0) {
    if (isPaused) {
        requestAnimationFrame(update);
        return;
    }

    const deltaTime = time - lastTime;
    lastTime = time;

    dropCounter += deltaTime;
    if (dropCounter > dropInterval) {
        playerDrop();
    }

    draw();
    requestAnimationFrame(update);
}

function draw() {
    context.clearRect(0, 0, canvas.width, canvas.height);
    drawMatrix(arena, {x: 0, y: 0});
    drawMatrix(player.matrix, player.pos);
    drawGrid();
}

function gameOver() {
    gameOverSound.play();
    finalScoreEl.innerText = player.score;
    gameOverOverlay.classList.add('active');
    isPaused = true;
}

// Event Listeners for Keyboard Controls
document.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft' || event.key === 'a') {
        playerMove(-1);
    } else if (event.key === 'ArrowRight' || event.key === 'd') {
        playerMove(1);
    } else if (event.key === 'ArrowDown' || event.key === 's') {
        playerDrop();
    } else if (event.key === 'ArrowUp' || event.key === 'w') {
        playerRotate(1);
    } else if (event.key === 'p') {
        togglePause();
    }
});

// Event Listeners for Button Controls
document.getElementById('left-btn').addEventListener('click', () => playerMove(-1));
document.getElementById('right-btn').addEventListener('click', () => playerMove(1));
document.getElementById('down-btn').addEventListener('click', playerDrop);
document.getElementById('rotate-btn').addEventListener('click', () => playerRotate(1));

// Pause Button Listener
pauseBtn.addEventListener('click', togglePause);

function togglePause() {
    isPaused = !isPaused;
    pauseBtn.innerText = isPaused ? '▶️ Resume' : '⏸ Pause';
    if (!isPaused) {
        requestAnimationFrame(update);
    }
}

//Next Piece toggle
document.getElementById('toggle-next-piece').addEventListener('click', () => {
    showNextPiece = !showNextPiece;
    document.getElementById('next-piece').style.display = showNextPiece ? 'block' : 'none';
    adjustScoreMultiplier();
});

// Restart Button Listener
restartBtn.addEventListener('click', () => {
    arena = createMatrix(cols, rows);
    player.score = 0;
    document.getElementById('score').innerText = player.score;
    dropInterval = 1000; // Reset drop interval
    gameOverOverlay.classList.remove('active');
    playerReset();
    isPaused = false;
    pauseBtn.innerText = '⏸ Pause';
    requestAnimationFrame(update);
});

// Touch Controls using Hammer.js
const hammer = new Hammer(canvas);

hammer.get('swipe').set({ direction: Hammer.DIRECTION_ALL });

hammer.on('swipeleft', () => playerMove(-1));
hammer.on('swiperight', () => playerMove(1));
hammer.on('swipedown', () => playerDrop());
hammer.on('swipeup', () => playerRotate(1));

// Optional: Tap to Rotate
hammer.on('tap', () => playerRotate(1));

// Initial Setup
playerReset();
update();
