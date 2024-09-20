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

let player = {
    pos: {x: 0, y: 0},
    matrix: null,
    score: 0
};

const pieces = 'ILJOTSZ';
const colors = ['cyan', 'blue', 'orange', 'yellow', 'green', 'purple', 'red'];

// Sound Effects
const moveSound = new Audio('move.wav');
const rotateSound = new Audio('rotate.wav');
const dropSound = new Audio('rotate.wav');
const clearSound = new Audio('clear.wav');
const gameOverSound = new Audio('gameover.wav');

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
                [0, 1, 0],
                [1, 1, 1],
                [0, 0, 0],
            ];
        case 'O':
            return [
                [1, 1],
                [1, 1],
            ];
        case 'L':
            return [
                [0, 0, 1],
                [1, 1, 1],
                [0, 0, 0],
            ];
        case 'J':
            return [
                [1, 0, 0],
                [1, 1, 1],
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
                [0, 1, 1],
                [1, 1, 0],
                [0, 0, 0],
            ];
        case 'Z':
            return [
                [1, 1, 0],
                [0, 1, 1],
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

    return transposedMatrix;
}

function playerRotate(dir) {
    const originalMatrix = player.matrix;
    const rotatedMatrix = rotate(player.matrix, dir);
    const originalPosX = player.pos.x;

    // Check for collisions and adjust the position if needed
    while (collide(arena, { ...player, matrix: rotatedMatrix })) {
        player.pos.x += dir > 0 ? -1 : 1; // Try shifting left or right
        if (player.pos.x > originalPosX + 1 || player.pos.x < originalPosX - 1) {
            player.matrix = originalMatrix; // Revert rotation if no valid position
            return;
        }
    }

    player.matrix = rotatedMatrix;
    rotateSound.play();
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
        player.score += rowCount * 10;
        rowCount *= 2; // Increase points for multiple lines

        clearSound.play();

        if (player.score > highScore) {
            highScore = player.score;
            localStorage.setItem('tetrisHighScore', highScore);
            document.getElementById('high-score').innerText = highScore;
        }

        // Level progression: Increase difficulty every 100 points
        if (player.score % 100 === 0 && dropInterval > 100) {
            dropInterval -= 100; // Increase speed
        }

        y++;
    }
    document.getElementById('score').innerText = player.score;
}

function playerReset() {
    const piecesIndex = Math.floor(Math.random() * pieces.length);
    player.matrix = createPiece(pieces[piecesIndex]);
    player.pos.y = 0;
    player.pos.x = (arena[0].length / 2 | 0) - (player.matrix[0].length / 2 | 0);

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
