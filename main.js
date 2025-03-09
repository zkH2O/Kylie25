import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

let camera, scene, renderer, controls;
let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;
let isJumping = false;
let jumpVelocity = 0;
const GRAVITY = -30;
const JUMP_FORCE = 10;
let canJump = true;
let prevTime = performance.now();
let velocity = new THREE.Vector3();
let direction = new THREE.Vector3();
let isZooming = false;
let artworks = [];
let furniture = []; // Array to store furniture for collision detection

// Museum dimensions
const ROOM_WIDTH = 50;
const ROOM_HEIGHT = 6;
const ROOM_LENGTH = 30;

// Artwork dimensions
const FRAME_DEPTH = 0.1;
const MAX_ARTWORK_DIMENSION = 5; // Maximum size for any dimension to keep artworks reasonably sized

// Add variables to store original camera position and rotation
let originalCameraPosition = null;
let originalCameraRotation = null;

init();
animate();

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf5f5f5); // Light gray background

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.y = 2;

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);

    // Create loading manager for textures
    const loadingManager = new THREE.LoadingManager();
    
    // Get loading UI elements
    const loadingContainer = document.getElementById('loading-container');
    const loadingProgress = document.getElementById('loading-progress');
    const loadingText = document.getElementById('loading-text');
    
    loadingManager.onStart = function(url, itemsLoaded, itemsTotal) {
        console.log('Started loading: ' + url);
        loadingText.textContent = 'Started loading: ' + url.split('/').pop();
    };

    loadingManager.onLoad = function() {
        console.log('Loading complete!');
        // Hide loading screen with a fade out effect
        loadingContainer.style.transition = 'opacity 1s';
        loadingContainer.style.opacity = 0;
        setTimeout(() => {
            loadingContainer.style.display = 'none';
        }, 1000);
    };

    loadingManager.onProgress = function(url, itemsLoaded, itemsTotal) {
        console.log('Loading file: ' + url + ' (' + itemsLoaded + '/' + itemsTotal + ')');
        
        // Update loading bar
        const progress = (itemsLoaded / itemsTotal) * 100;
        loadingProgress.style.width = progress + '%';
        
        // Update loading text
        loadingText.textContent = `Loading ${url.split('/').pop()} (${itemsLoaded}/${itemsTotal})`;
    };

    loadingManager.onError = function(url) {
        console.error('Error loading: ' + url);
        loadingText.textContent = 'Error loading: ' + url.split('/').pop();
        loadingText.style.color = 'red';
    };

    // Store loading manager in a global variable to use in other functions
    window.textureLoadingManager = loadingManager;

    // Create floor with gradient
    const floorGeometry = new THREE.PlaneGeometry(ROOM_WIDTH, ROOM_LENGTH);
    
    // Custom shader material for gradient floor
    const floorMaterial = new THREE.ShaderMaterial({
        uniforms: {
            lightPosition: { value: new THREE.Vector3(0, ROOM_HEIGHT - 0.5, 0) },
            darkColor: { value: new THREE.Color(0x48494B) },
            lightColor: { value: new THREE.Color(0x777B7E) }
        },
        vertexShader: `
            varying vec2 vUv;
            varying vec3 vPosition;
            
            void main() {
                vUv = uv;
                vPosition = position;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform vec3 lightPosition;
            uniform vec3 darkColor;
            uniform vec3 lightColor;
            varying vec2 vUv;
            varying vec3 vPosition;
            
            void main() {
                float distanceFromCenter = length(vPosition.xz) / 30.0;
                float gradient = 1.0 - smoothstep(0.0, 1.0, distanceFromCenter);
                vec3 finalColor = mix(darkColor, lightColor, gradient);
                gl_FragColor = vec4(finalColor, 1.0);
            }
        `,
        side: THREE.DoubleSide
    });

    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Enhanced Lighting
    setupLighting();

    // Controls
    controls = new PointerLockControls(camera, document.body);

    document.addEventListener('click', function () {
        controls.lock();
    });

    // Walls and Artwork
    createWalls();
    createArtworks();

    // Movement controls
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    // Window resize handler
    window.addEventListener('resize', onWindowResize, false);

    // Add a key binding for emergency reset
    document.addEventListener('keydown', function(event) {
        // Press 'R' key to reset position if stuck outside
        if (event.code === 'KeyR') {
            debugLog("Emergency reset triggered");
            emergencyReset();
        }
    });
}

function setupLighting() {
    // Ambient light - slightly dimmer to make picture lamps stand out
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    // Create track lighting system
    const trackLights = [];
    const trackPositions = [
        // Two parallel tracks along the length of the room
        { start: new THREE.Vector3(-15, ROOM_HEIGHT - 0.2, -ROOM_LENGTH/2 + 5), end: new THREE.Vector3(-15, ROOM_HEIGHT - 0.2, ROOM_LENGTH/2 - 5) },
        { start: new THREE.Vector3(15, ROOM_HEIGHT - 0.2, -ROOM_LENGTH/2 + 5), end: new THREE.Vector3(15, ROOM_HEIGHT - 0.2, ROOM_LENGTH/2 - 5) }
    ];

    // Create track lighting
    trackPositions.forEach(track => {
        // Create track
        const trackGeometry = new THREE.BoxGeometry(0.2, 0.1, ROOM_LENGTH - 10);
        const trackMaterial = new THREE.MeshStandardMaterial({ color: 0x2a2a2a });
        const trackMesh = new THREE.Mesh(trackGeometry, trackMaterial);
        trackMesh.position.set(track.start.x, track.start.y, 0);
        scene.add(trackMesh);

        // Add lights along the track - slightly dimmer to make picture lamps stand out
        for (let z = -ROOM_LENGTH/2 + 5; z <= ROOM_LENGTH/2 - 5; z += 5) {
            const light = new THREE.SpotLight(0xffffff, 20);
            light.position.set(track.start.x, ROOM_HEIGHT - 0.3, z);
            light.angle = Math.PI / 6;
            light.penumbra = 0.5;
            light.decay = 1.5;
            light.distance = 15;
            light.castShadow = true;
            scene.add(light);

            // Add light fixture
            const fixtureGeometry = new THREE.CylinderGeometry(0.2, 0.2, 0.3, 8);
            const fixtureMaterial = new THREE.MeshStandardMaterial({ color: 0x808080 });
            const fixture = new THREE.Mesh(fixtureGeometry, fixtureMaterial);
            fixture.position.set(track.start.x, ROOM_HEIGHT - 0.4, z);
            scene.add(fixture);
        }
    });

    // Add ventilation ducts
    const createVent = (x, z) => {
        const ventGroup = new THREE.Group();
        
        // Vent grill - make it parallel to the ceiling
        const grillGeometry = new THREE.PlaneGeometry(1.5, 1.5);
        const grillMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x888888,
            metalness: 0.8,
            roughness: 0.2,
            side: THREE.DoubleSide
        });
        const grill = new THREE.Mesh(grillGeometry, grillMaterial);
        
        // Create a separate group for the grill and bars so they share the same rotation
        const grillWithBarsGroup = new THREE.Group();
        grillWithBarsGroup.add(grill);
        
        // Add grill details (bars) - aligned with the grill
        for (let i = -0.6; i <= 0.6; i += 0.2) {
            const barGeometry = new THREE.BoxGeometry(1.5, 0.05, 0.05);
            const bar = new THREE.Mesh(barGeometry, grillMaterial);
            bar.position.set(0, i, 0); // Position bars along Y axis before rotation
            grillWithBarsGroup.add(bar);
        }
        
        // Rotate the entire group to be parallel with ceiling
        grillWithBarsGroup.rotation.x = Math.PI / 2;
        
        ventGroup.add(grillWithBarsGroup);
        ventGroup.position.set(x, ROOM_HEIGHT - 0.01, z);
        return ventGroup;
    };

    // Add vents in a grid pattern
    for (let x = -ROOM_WIDTH/3; x <= ROOM_WIDTH/3; x += ROOM_WIDTH/3) {
        for (let z = -ROOM_LENGTH/3; z <= ROOM_LENGTH/3; z += ROOM_LENGTH/3) {
            scene.add(createVent(x, z));
        }
    }

    // Add decorative elements
    // Modern planters in corners
    const createPlanter = (x, z) => {
        const planterGroup = new THREE.Group();
        
        // Planter box
        const boxGeometry = new THREE.BoxGeometry(2, 3, 2);
        const boxMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x505050,
            metalness: 0.3,
            roughness: 0.7
        });
        const box = new THREE.Mesh(boxGeometry, boxMaterial);
        box.position.y = 1.5;
        planterGroup.add(box);
        
        // Plant (simplified representation)
        const plantGeometry = new THREE.SphereGeometry(1, 8, 8);
        const plantMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x0f5f2f,
            roughness: 0.8
        });
        const plant = new THREE.Mesh(plantGeometry, plantMaterial);
        plant.position.y = 3.5;
        planterGroup.add(plant);
        
        planterGroup.position.set(x, 0, z);

        // Add to furniture array for collision detection
        furniture.push({
            type: 'planter',
            position: new THREE.Vector3(x, 0, z),
            dimensions: new THREE.Vector3(2, 3, 2)
        });
        
        return planterGroup;
    };

    // Add planters in corners
    scene.add(createPlanter(-ROOM_WIDTH/2 + 2, -ROOM_LENGTH/2 + 2));
    scene.add(createPlanter(-ROOM_WIDTH/2 + 2, ROOM_LENGTH/2 - 2));
    scene.add(createPlanter(ROOM_WIDTH/2 - 2, -ROOM_LENGTH/2 + 2));
    scene.add(createPlanter(ROOM_WIDTH/2 - 2, ROOM_LENGTH/2 - 2));

    // Add benches
    const createBench = (x, z, rotation) => {
        const benchGroup = new THREE.Group();
        
        // Bench dimensions
        const benchWidth = 4;
        const benchHeight = 1;
        const benchDepth = 1.5;
        const seatHeight = 0.8;
        const seatThickness = 0.1;
        const legWidth = 0.15;
        
        // Materials
        const woodMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x4a3c2a,
            roughness: 0.8,
            metalness: 0.1
        });
        
        const metalMaterial = new THREE.MeshStandardMaterial({
            color: 0x333333,
            roughness: 0.5,
            metalness: 0.7
        });
        
        // Seat
        const seatGeometry = new THREE.BoxGeometry(benchWidth, seatThickness, benchDepth);
        const seat = new THREE.Mesh(seatGeometry, woodMaterial);
        seat.position.y = seatHeight;
        seat.castShadow = true;
        seat.receiveShadow = true;
        benchGroup.add(seat);
        
        // Legs - more detailed with multiple parts
        // Front left leg
        const createLeg = (xPos, zPos) => {
            const legGroup = new THREE.Group();
            
            // Vertical part
            const verticalLegGeometry = new THREE.BoxGeometry(legWidth, seatHeight, legWidth);
            const verticalLeg = new THREE.Mesh(verticalLegGeometry, metalMaterial);
            verticalLeg.position.set(0, seatHeight/2, 0);
            verticalLeg.castShadow = true;
            legGroup.add(verticalLeg);
            
            // Foot
            const footGeometry = new THREE.BoxGeometry(legWidth * 1.5, legWidth * 0.5, legWidth * 1.5);
            const foot = new THREE.Mesh(footGeometry, metalMaterial);
            foot.position.set(0, 0.05, 0);
            foot.castShadow = true;
            legGroup.add(foot);
            
            legGroup.position.set(xPos, 0, zPos);
            return legGroup;
        };
        
        // Add four legs at the corners
        benchGroup.add(createLeg(benchWidth/2 - legWidth, benchDepth/2 - legWidth));
        benchGroup.add(createLeg(-benchWidth/2 + legWidth, benchDepth/2 - legWidth));
        benchGroup.add(createLeg(benchWidth/2 - legWidth, -benchDepth/2 + legWidth));
        benchGroup.add(createLeg(-benchWidth/2 + legWidth, -benchDepth/2 + legWidth));
        
        // Add support bars between legs
        const createSupportBar = (isLongSide) => {
            const length = isLongSide ? benchWidth - legWidth * 3 : benchDepth - legWidth * 3;
            const barGeometry = new THREE.BoxGeometry(isLongSide ? length : legWidth, legWidth, isLongSide ? legWidth : length);
            const bar = new THREE.Mesh(barGeometry, metalMaterial);
            bar.castShadow = true;
            return bar;
        };
        
        // Front support
        const frontSupport = createSupportBar(true);
        frontSupport.position.set(0, seatHeight * 0.3, benchDepth/2 - legWidth);
        benchGroup.add(frontSupport);
        
        // Back support
        const backSupport = createSupportBar(true);
        backSupport.position.set(0, seatHeight * 0.3, -benchDepth/2 + legWidth);
        benchGroup.add(backSupport);
        
        // Left support
        const leftSupport = createSupportBar(false);
        leftSupport.position.set(-benchWidth/2 + legWidth, seatHeight * 0.3, 0);
        benchGroup.add(leftSupport);
        
        // Right support
        const rightSupport = createSupportBar(false);
        rightSupport.position.set(benchWidth/2 - legWidth, seatHeight * 0.3, 0);
        benchGroup.add(rightSupport);
        
        // Position and rotate the entire bench
        benchGroup.position.set(x, 0, z);
        benchGroup.rotation.y = rotation;
        
        // Add to furniture array for collision detection
        furniture.push({
            type: 'bench',
            position: new THREE.Vector3(x, 0, z),
            dimensions: new THREE.Vector3(benchWidth, benchHeight, benchDepth),
            rotation: rotation
        });
        
        return benchGroup;
    };

    // Add benches in the room
    scene.add(createBench(0, -ROOM_LENGTH/4, 0));
    scene.add(createBench(0, ROOM_LENGTH/4, 0));
}

function createArtworkFrame(width, height, depth) {
    const frame = new THREE.Group();
    
    // Frame material
    const frameMaterial = new THREE.MeshStandardMaterial({
        color: 0x4a4a4a,
        roughness: 0.5,
        metalness: 0.5
    });

    // Create frame pieces
    const frameThickness = 0.1;
    
    // Top
    const topGeometry = new THREE.BoxGeometry(width + frameThickness * 2, frameThickness, depth);
    const top = new THREE.Mesh(topGeometry, frameMaterial);
    top.position.y = height/2 + frameThickness/2;
    frame.add(top);

    // Bottom
    const bottom = new THREE.Mesh(topGeometry, frameMaterial);
    bottom.position.y = -height/2 - frameThickness/2;
    frame.add(bottom);

    // Left
    const sideGeometry = new THREE.BoxGeometry(frameThickness, height + frameThickness * 2, depth);
    const left = new THREE.Mesh(sideGeometry, frameMaterial);
    left.position.x = -width/2 - frameThickness/2;
    frame.add(left);

    // Right
    const right = new THREE.Mesh(sideGeometry, frameMaterial);
    right.position.x = width/2 + frameThickness/2;
    frame.add(right);

    return frame;
}

function createArtworks() {
    // Create a texture loader with the loading manager
    const textureLoader = new THREE.TextureLoader(window.textureLoadingManager);
    
    // Array of image paths
    const imagePaths = [
        'images/img1.jpg',
        'images/img2.jpg',
        'images/img3.jpg',
        'images/img4.jpg',
        'images/img5.jpg',
        'images/img6.jpg',
        'images/img7.jpg',
        'images/img8.jpg',
        'images/img9.jpg',
        'images/img10.jpg',
        'images/img11.jpg'
    ];
    
    // Artwork titles and descriptions
    const artworkInfo = [
        { 
            title: "3-1-25", 
            description: "We are going to rezz every time." 
        },
        { 
            title: "10-19-24", 
            description: "Your laugh is my favorite sound in the world. I fall more in love with you every day." 
        },
        { 
            title: "10-12-24", 
            description: "First rave togetherrrrr. I love you happy birthday sweet 21." 
        },
        { 
            title: "9-23-24", 
            description: "Are you a high-resolution camera? Because every time I see you, you make my world ultra HD." 
        },
        { 
            title: "10-26-24", 
            description: "Are you Remy? Because you've taken control of my heart just like you took control of Linguini!💕🐭🍝" 
        },
        { 
            title: "12-31-24", 
            description: "Miles of road, music playing, and your hand in mine. I'd drive anywhere as long as you're by my side." 
        },
        { 
            title: "2-14-25", 
            description: "Your cuddles are the best part of my day. ❤️" 
        },
        { 
            title: "8-11-24", 
            description: "Are you a squat rack? Because I can't resist getting under you." 
        },
        { 
            title: "idk the date", 
            description: "Sunshine, sandwiches, and your sweet kisses. Simple joys become treasures when I'm with you. You're the cherry on top of my life." 
        },
        { 
            title: "10-13-24", 
            description: "Are you my remedy? Because in the chaos of life, you're the clarity that keeps me sane.💖🎶" 
        },
        { 
            title: "2-14-25", 
            description: "Thank you for sharing your heart with me. I promise to cherish it always. Forever yours. ❤️" 
        }
    ];
    
    // Create 11 artworks
    const artworkPositions = [
        // Left wall
        { position: new THREE.Vector3(-ROOM_WIDTH/2 + 0.2, ROOM_HEIGHT/2, -10), rotation: Math.PI/2 },
        { position: new THREE.Vector3(-ROOM_WIDTH/2 + 0.2, ROOM_HEIGHT/2, 0), rotation: Math.PI/2 },
        { position: new THREE.Vector3(-ROOM_WIDTH/2 + 0.2, ROOM_HEIGHT/2, 10), rotation: Math.PI/2 },
        
        // Right wall
        { position: new THREE.Vector3(ROOM_WIDTH/2 - 0.2, ROOM_HEIGHT/2, -10), rotation: -Math.PI/2 },
        { position: new THREE.Vector3(ROOM_WIDTH/2 - 0.2, ROOM_HEIGHT/2, 0), rotation: -Math.PI/2 },
        { position: new THREE.Vector3(ROOM_WIDTH/2 - 0.2, ROOM_HEIGHT/2, 10), rotation: -Math.PI/2 },
        
        // Back wall
        { position: new THREE.Vector3(-15, ROOM_HEIGHT/2, -ROOM_LENGTH/2 + 0.2), rotation: 0 },
        { position: new THREE.Vector3(-5, ROOM_HEIGHT/2, -ROOM_LENGTH/2 + 0.2), rotation: 0 },
        { position: new THREE.Vector3(5, ROOM_HEIGHT/2, -ROOM_LENGTH/2 + 0.2), rotation: 0 },
        { position: new THREE.Vector3(15, ROOM_HEIGHT/2, -ROOM_LENGTH/2 + 0.2), rotation: 0 },
        
        // Front wall center
        { position: new THREE.Vector3(0, ROOM_HEIGHT/2, ROOM_LENGTH/2 - 0.2), rotation: Math.PI },
    ];

    // Load each image and create artwork with proper dimensions
    imagePaths.forEach((path, index) => {
        const texture = textureLoader.load(path, (loadedTexture) => {
            // Get the image dimensions from the loaded texture
            const imageWidth = loadedTexture.image.width;
            const imageHeight = loadedTexture.image.height;
            
            // Calculate aspect ratio
            const aspectRatio = imageWidth / imageHeight;
            
            // Determine artwork dimensions while maintaining aspect ratio
            // and ensuring it's not too large for the museum
            let artworkWidth, artworkHeight;
            
            if (aspectRatio >= 1) {
                // Landscape or square image
                artworkWidth = Math.min(MAX_ARTWORK_DIMENSION, 4);
                artworkHeight = artworkWidth / aspectRatio;
            } else {
                // Portrait image
                artworkHeight = Math.min(MAX_ARTWORK_DIMENSION, 4);
                artworkWidth = artworkHeight * aspectRatio;
            }
            
            // Create artwork geometry with the proper dimensions
            const artworkGeometry = new THREE.PlaneGeometry(artworkWidth, artworkHeight);
            
            // Create artwork material with the loaded texture
            const artworkMaterial = new THREE.MeshStandardMaterial({
                map: loadedTexture,
                roughness: 0.7,
                metalness: 0.2
            });
            
            const artwork = new THREE.Mesh(artworkGeometry, artworkMaterial);
            
            // Create frame that fits the artwork dimensions
            const frame = createArtworkFrame(artworkWidth, artworkHeight, FRAME_DEPTH);
            
            const artworkGroup = new THREE.Group();
            artworkGroup.add(artwork);
            artworkGroup.add(frame);
            
            const pos = artworkPositions[index];
            artworkGroup.position.copy(pos.position);
            artworkGroup.rotation.y = pos.rotation;
            
            // Add picture lamp above the artwork
            addPictureLamp(artworkGroup, artworkWidth, artworkHeight, pos.rotation);
            
            scene.add(artworkGroup);
            artworks.push({
                group: artworkGroup,
                originalPosition: pos.position.clone(),
                isZoomed: false,
                imagePath: path,
                title: artworkInfo[index].title,
                description: artworkInfo[index].description,
                width: artworkWidth,
                height: artworkHeight
            });
        });
    });
}

// Function to add a picture lamp above an artwork
function addPictureLamp(artworkGroup, artworkWidth, artworkHeight, rotation) {
    // Create lamp group
    const lampGroup = new THREE.Group();
    
    // Lamp dimensions
    const lampWidth = 0.25;
    const lampHeight = 0.12;
    const lampDepth = 0.35;
    const armLength = 0.6;
    
    // Warm light color (slightly orange/yellow)
    const lightColor = 0xffcc88;
    
    // Create lamp housing
    const lampHousingGeometry = new THREE.BoxGeometry(lampWidth, lampHeight, lampDepth);
    const lampHousingMaterial = new THREE.MeshStandardMaterial({
        color: 0x333333,
        roughness: 0.7,
        metalness: 0.8,
        emissive: lightColor,
        emissiveIntensity: 0.2 // Subtle glow effect
    });
    
    const lampHousing = new THREE.Mesh(lampHousingGeometry, lampHousingMaterial);
    lampHousing.position.set(0, 0, -lampDepth / 2); // Position in front of the arm
    lampGroup.add(lampHousing);
    
    // Create lamp shade (bottom part that emits light)
    const shadeGeometry = new THREE.BoxGeometry(lampWidth - 0.05, 0.02, lampDepth - 0.05);
    const shadeMaterial = new THREE.MeshStandardMaterial({
        color: lightColor,
        roughness: 0.3,
        metalness: 0.5,
        emissive: lightColor,
        emissiveIntensity: 0.8 // Strong glow effect
    });
    
    const lampShade = new THREE.Mesh(shadeGeometry, shadeMaterial);
    lampShade.position.set(0, -lampHeight/2 + 0.01, -lampDepth / 2);
    lampGroup.add(lampShade);
    
    // Create lamp arm (connecting to wall)
    const lampArmGeometry = new THREE.CylinderGeometry(0.02, 0.02, armLength);
    const lampArmMaterial = new THREE.MeshStandardMaterial({
        color: 0x555555,
        roughness: 0.5,
        metalness: 0.8
    });
    
    const lampArm = new THREE.Mesh(lampArmGeometry, lampArmMaterial);
    lampArm.rotation.x = Math.PI / 2;
    lampArm.position.set(0, 0, armLength / 2);
    lampGroup.add(lampArm);
    
    // Create wall mount
    const mountGeometry = new THREE.CylinderGeometry(0.05, 0.05, 0.05, 16);
    const mount = new THREE.Mesh(mountGeometry, lampArmMaterial);
    mount.rotation.x = Math.PI / 2;
    mount.position.set(0, 0, armLength);
    lampGroup.add(mount);
    
    // Add spotlight for the lamp
    const spotlight = new THREE.SpotLight(lightColor, 25);
    spotlight.position.set(0, -lampHeight/2, -lampDepth / 2);
    spotlight.angle = Math.PI / 4;
    spotlight.penumbra = 0.7;
    spotlight.decay = 1.2;
    spotlight.distance = 4;
    
    // Add a slight random offset to make each light unique
    const randomOffset = (Math.random() - 0.5) * 0.1;
    spotlight.angle += randomOffset;
    
    // Create a target object to point the light at the center of the artwork
    const targetObject = new THREE.Object3D();
    targetObject.position.set(0, 0, 0.1); // Slightly in front of the artwork
    artworkGroup.add(targetObject);
    spotlight.target = targetObject;
    
    // Add a subtle point light to create a glow effect
    const pointLight = new THREE.PointLight(lightColor, 0.8, 1);
    pointLight.position.set(0, -lampHeight/2, -lampDepth / 2);
    lampGroup.add(pointLight);
    
    lampGroup.add(spotlight);
    
    // Check if this is a back wall artwork by examining the position
    const isBackWall = Math.abs(artworkGroup.position.z + ROOM_LENGTH/2) < 1.0;
    
    // Position and rotate the lamp based on the wall it's on
    if (Math.abs(rotation) === Math.PI/2) {
        // For side walls (left and right)
        if (rotation > 0) {
            // Left wall
            lampGroup.position.set(-0.7, artworkHeight / 2 + 0.7, 0);
            lampGroup.rotation.y = 0;
        } else {
            // Right wall
            lampGroup.position.set(0.7, artworkHeight / 2 + 0.7, 0);
            lampGroup.rotation.y = Math.PI;
        }
    } else if (rotation === Math.PI) {
        // Front wall
        lampGroup.position.set(0, artworkHeight / 2 + 0.7, 0.7);
        lampGroup.rotation.y = 0;
    } else if (isBackWall) {
        // Back wall - special case
        // Position the lamp in front of the artwork (not behind the wall)
        lampGroup.position.set(0, artworkHeight / 2 + 0.7, 0.7);
        // Rotate to face the artwork
        lampGroup.rotation.y = 0;
        
        // Flip the lamp components to face the correct direction
        lampHousing.position.set(0, 0, lampDepth / 2);
        lampShade.position.set(0, -lampHeight/2 + 0.01, lampDepth / 2);
        lampArm.position.set(0, 0, -armLength / 2);
        mount.position.set(0, 0, -armLength);
        
        // Adjust the lights to point in the correct direction
        spotlight.position.set(0, -lampHeight/2, lampDepth / 2);
        pointLight.position.set(0, -lampHeight/2, lampDepth / 2);
    } else {
        // Default case (should not happen, but just in case)
        lampGroup.position.set(0, artworkHeight / 2 + 0.7, -0.7);
        lampGroup.rotation.y = Math.PI;
    }
    
    // Add the lamp to the artwork group
    artworkGroup.add(lampGroup);
}

function createWalls() {
    const wallMaterial = new THREE.MeshStandardMaterial({ 
        color: 0xffffff,
        roughness: 0.9,
        metalness: 0.1
    });

    // Back wall
    const backWall = new THREE.Mesh(
        new THREE.PlaneGeometry(ROOM_WIDTH, ROOM_HEIGHT),
        wallMaterial
    );
    backWall.position.z = -ROOM_LENGTH/2;
    backWall.position.y = ROOM_HEIGHT/2;
    backWall.receiveShadow = true;
    scene.add(backWall);

    // Front wall
    const frontWall = new THREE.Mesh(
        new THREE.PlaneGeometry(ROOM_WIDTH, ROOM_HEIGHT),
        wallMaterial
    );
    frontWall.position.z = ROOM_LENGTH/2;
    frontWall.position.y = ROOM_HEIGHT/2;
    frontWall.rotation.y = Math.PI;
    frontWall.receiveShadow = true;
    scene.add(frontWall);

    // Left wall
    const leftWall = new THREE.Mesh(
        new THREE.PlaneGeometry(ROOM_LENGTH, ROOM_HEIGHT),
        wallMaterial
    );
    leftWall.position.x = -ROOM_WIDTH/2;
    leftWall.position.y = ROOM_HEIGHT/2;
    leftWall.rotation.y = Math.PI/2;
    leftWall.receiveShadow = true;
    scene.add(leftWall);

    // Right wall
    const rightWall = new THREE.Mesh(
        new THREE.PlaneGeometry(ROOM_LENGTH, ROOM_HEIGHT),
        wallMaterial
    );
    rightWall.position.x = ROOM_WIDTH/2;
    rightWall.position.y = ROOM_HEIGHT/2;
    rightWall.rotation.y = -Math.PI/2;
    rightWall.receiveShadow = true;
    scene.add(rightWall);

    // Ceiling
    const ceiling = new THREE.Mesh(
        new THREE.PlaneGeometry(ROOM_WIDTH, ROOM_LENGTH),
        wallMaterial
    );
    ceiling.position.y = ROOM_HEIGHT;
    ceiling.rotation.x = Math.PI/2;
    ceiling.receiveShadow = true;
    scene.add(ceiling);
    
    // Add birthday decorations
    createBirthdayDecorations();
}

function createBirthdayDecorations() {
    createHappyBirthdaySign();
    createCeilingDecorations();
    createBalloons();
    createStreamers();
    createGiftBoxes();
}

// Create a Happy Birthday sign
function createHappyBirthdaySign() {
    // Create a canvas for the text
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 1024;
    canvas.height = 256;
    
    // Fill the background with a gradient
    const gradient = context.createLinearGradient(0, 0, canvas.width, 0);
    gradient.addColorStop(0, '#ff9999');
    gradient.addColorStop(0.5, '#ffcc99');
    gradient.addColorStop(1, '#99ccff');
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
    
    // Add a border
    context.strokeStyle = '#ff5555';
    context.lineWidth = 12;
    context.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
    
    // Add text
    context.font = 'bold 90px Arial';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = '#ff3366';
    context.fillText('Happy 23rd Birthday!', canvas.width / 2, canvas.height / 2);
    context.strokeStyle = 'white';
    context.lineWidth = 3;
    context.strokeText('Happy 23rd Birthday!', canvas.width / 2, canvas.height / 2);
    
    // Add decorative elements
    for (let i = 0; i < 10; i++) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const radius = 5 + Math.random() * 15;
        
        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fillStyle = `hsl(${Math.random() * 360}, 100%, 70%)`;
        context.fill();
    }
    
    // Create texture from canvas
    const texture = new THREE.CanvasTexture(canvas);
    
    // Create sign material with the texture
    const signMaterial = new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.5,
        metalness: 0.2,
        side: THREE.DoubleSide
    });
    
    // Create sign geometry - larger for ceiling placement
    const signWidth = 10;
    const signHeight = 2.5;
    const signGeometry = new THREE.PlaneGeometry(signWidth, signHeight);
    
    // Create sign mesh
    const sign = new THREE.Mesh(signGeometry, signMaterial);
    
    // Position the sign on the ceiling in the center of the room
    sign.position.set(0, ROOM_HEIGHT - 0.05, 0);
    sign.rotation.x = Math.PI / 2; // Rotate to face down from ceiling
    
    // Add to scene
    scene.add(sign);
    
    // Add a frame around the sign
    const frameThickness = 0.1;
    const frameMaterial = new THREE.MeshStandardMaterial({
        color: 0xcc3366,
        roughness: 0.5,
        metalness: 0.5
    });
    
    // Create a frame group
    const frameGroup = new THREE.Group();
    
    // Top frame (now front from viewer perspective)
    const topFrame = new THREE.Mesh(
        new THREE.BoxGeometry(signWidth + frameThickness * 2, frameThickness, 0.1),
        frameMaterial
    );
    topFrame.position.set(0, 0, signHeight/2 + frameThickness/2);
    frameGroup.add(topFrame);
    
    // Bottom frame (now back from viewer perspective)
    const bottomFrame = new THREE.Mesh(
        new THREE.BoxGeometry(signWidth + frameThickness * 2, frameThickness, 0.1),
        frameMaterial
    );
    bottomFrame.position.set(0, 0, -signHeight/2 - frameThickness/2);
    frameGroup.add(bottomFrame);
    
    // Left frame
    const leftFrame = new THREE.Mesh(
        new THREE.BoxGeometry(frameThickness, frameThickness, signHeight + frameThickness * 2),
        frameMaterial
    );
    leftFrame.position.set(-signWidth/2 - frameThickness/2, 0, 0);
    frameGroup.add(leftFrame);
    
    // Right frame
    const rightFrame = new THREE.Mesh(
        new THREE.BoxGeometry(frameThickness, frameThickness, signHeight + frameThickness * 2),
        frameMaterial
    );
    rightFrame.position.set(signWidth/2 + frameThickness/2, 0, 0);
    frameGroup.add(rightFrame);
    
    // Position and rotate the frame to match the sign
    frameGroup.position.copy(sign.position);
    frameGroup.position.y -= 0.05; // Slightly lower than the ceiling to avoid z-fighting
    frameGroup.rotation.x = Math.PI / 2;
    
    scene.add(frameGroup);
    
    // Add spotlights to illuminate the sign
    const spotLight1 = new THREE.SpotLight(0xffffff, 30);
    spotLight1.position.set(-signWidth/2, ROOM_HEIGHT - 1, 0);
    spotLight1.target = sign;
    spotLight1.angle = Math.PI / 6;
    spotLight1.penumbra = 0.5;
    spotLight1.decay = 1.5;
    spotLight1.distance = 10;
    scene.add(spotLight1);
    
    const spotLight2 = new THREE.SpotLight(0xffffff, 30);
    spotLight2.position.set(signWidth/2, ROOM_HEIGHT - 1, 0);
    spotLight2.target = sign;
    spotLight2.angle = Math.PI / 6;
    spotLight2.penumbra = 0.5;
    spotLight2.decay = 1.5;
    spotLight2.distance = 10;
    scene.add(spotLight2);
}

function createCeilingDecorations() {
    // Create paper lanterns
    createPaperLanterns();
    
    // Create confetti particles
    createConfetti();
}

// Create paper lanterns hanging from the ceiling
function createPaperLanterns() {
    const lanternColors = [
        0xff9999, // Light pink
        0x99ccff, // Light blue
        0xccff99, // Light green
        0xffffcc, // Light yellow
        0xffcc99  // Light orange
    ];
    
    // Create lanterns in a grid pattern
    for (let x = -ROOM_WIDTH/3; x <= ROOM_WIDTH/3; x += ROOM_WIDTH/3) {
        for (let z = -ROOM_LENGTH/3; z <= ROOM_LENGTH/3; z += ROOM_LENGTH/3) {
            // Skip the center where the birthday sign is
            if (x === 0 && z === 0) continue;
            
            createPaperLantern(
                x, 
                ROOM_HEIGHT - 0.5 - Math.random() * 1.5, 
                z,
                0.4 + Math.random() * 0.3,
                lanternColors[Math.floor(Math.random() * lanternColors.length)]
            );
        }
    }
}

// Create a single paper lantern
function createPaperLantern(x, y, z, size, color) {
    // Create lantern group
    const lanternGroup = new THREE.Group();
    
    // Create lantern body (sphere with vertical segments)
    const lanternGeometry = new THREE.SphereGeometry(size, 16, 8);
    const lanternMaterial = new THREE.MeshStandardMaterial({
        color: color,
        roughness: 0.7,
        metalness: 0.1,
        emissive: color,
        emissiveIntensity: 0.2,
        side: THREE.DoubleSide
    });
    
    const lantern = new THREE.Mesh(lanternGeometry, lanternMaterial);
    lanternGroup.add(lantern);
    
    // Create top cap
    const topCapGeometry = new THREE.CylinderGeometry(size * 0.3, size * 0.5, size * 0.2, 16);
    const topCapMaterial = new THREE.MeshStandardMaterial({
        color: 0x333333,
        roughness: 0.8,
        metalness: 0.5
    });
    
    const topCap = new THREE.Mesh(topCapGeometry, topCapMaterial);
    topCap.position.y = size * 0.6;
    lanternGroup.add(topCap);
    
    // Create bottom cap
    const bottomCapGeometry = new THREE.CylinderGeometry(size * 0.5, size * 0.3, size * 0.2, 16);
    const bottomCap = new THREE.Mesh(bottomCapGeometry, topCapMaterial);
    bottomCap.position.y = -size * 0.6;
    lanternGroup.add(bottomCap);
    
    // Create string to hang the lantern
    const stringHeight = ROOM_HEIGHT - y;
    const stringGeometry = new THREE.CylinderGeometry(0.01, 0.01, stringHeight);
    const stringMaterial = new THREE.MeshStandardMaterial({
        color: 0xeeeeee,
        roughness: 0.5
    });
    
    const string = new THREE.Mesh(stringGeometry, stringMaterial);
    string.position.y = stringHeight / 2 + size * 0.6;
    lanternGroup.add(string);
    
    // Add a point light inside the lantern
    const light = new THREE.PointLight(color, 1, 3);
    light.position.set(0, 0, 0);
    lanternGroup.add(light);
    
    // Position the lantern
    lanternGroup.position.set(x, y, z);
    
    // Add to scene
    scene.add(lanternGroup);
}

// Create confetti particles floating in the air
function createConfetti() {
    const confettiColors = [
        0xff3366, // Pink
        0x3366ff, // Blue
        0x33cc33, // Green
        0xffcc00, // Yellow
        0xff6600, // Orange
        0x9933ff  // Purple
    ];
    
    // Create confetti group
    const confettiGroup = new THREE.Group();
    
    // Create 200 confetti particles
    for (let i = 0; i < 200; i++) {
        // Random position within the room
        const x = -ROOM_WIDTH/2 + Math.random() * ROOM_WIDTH;
        const y = 1 + Math.random() * (ROOM_HEIGHT - 1.5);
        const z = -ROOM_LENGTH/2 + Math.random() * ROOM_LENGTH;
        
        // Random size
        const size = 0.05 + Math.random() * 0.1;
        
        // Random color
        const color = confettiColors[Math.floor(Math.random() * confettiColors.length)];
        
        // Create confetti geometry (flat rectangle)
        const confettiGeometry = new THREE.PlaneGeometry(size, size * 0.5);
        const confettiMaterial = new THREE.MeshStandardMaterial({
            color: color,
            roughness: 0.5,
            metalness: 0.3,
            side: THREE.DoubleSide
        });
        
        const confetti = new THREE.Mesh(confettiGeometry, confettiMaterial);
        
        // Random rotation
        confetti.rotation.x = Math.random() * Math.PI;
        confetti.rotation.y = Math.random() * Math.PI;
        confetti.rotation.z = Math.random() * Math.PI;
        
        // Set position
        confetti.position.set(x, y, z);
        
        // Add to group
        confettiGroup.add(confetti);
    }
    
    // Add to scene
    scene.add(confettiGroup);
}

function createBalloons() {
    // Balloon colors
    const balloonColors = [
        0xff3366, // Pink
        0x3366ff, // Blue
        0x33cc33, // Green
        0xffcc00, // Yellow
        0xff6600, // Orange
        0x9933ff  // Purple
    ];
    
    // Create balloon groups at different locations
    createBalloonGroup(-ROOM_WIDTH/4, 0, -ROOM_LENGTH/4, 5, balloonColors);
    createBalloonGroup(ROOM_WIDTH/4, 0, -ROOM_LENGTH/4, 5, balloonColors);
    createBalloonGroup(0, 0, ROOM_LENGTH/4, 5, balloonColors);
    createBalloonGroup(-ROOM_WIDTH/3, 0, ROOM_LENGTH/3, 3, balloonColors);
    createBalloonGroup(ROOM_WIDTH/3, 0, ROOM_LENGTH/3, 3, balloonColors);
}

function createBalloonGroup(x, y, z, count, colors) {
    const group = new THREE.Group();
    
    for (let i = 0; i < count; i++) {
        // Create balloon
        const balloonGeometry = new THREE.SphereGeometry(0.3 + Math.random() * 0.2, 16, 16);
        const balloonMaterial = new THREE.MeshStandardMaterial({
            color: colors[Math.floor(Math.random() * colors.length)],
            roughness: 0.2,
            metalness: 0.3,
            emissive: 0x111111
        });
        
        const balloon = new THREE.Mesh(balloonGeometry, balloonMaterial);
        
        // Position balloon in a cluster
        const angle = Math.random() * Math.PI * 2;
        const radius = 0.3 + Math.random() * 0.5;
        balloon.position.set(
            radius * Math.cos(angle),
            3 + Math.random() * (ROOM_HEIGHT - 4),
            radius * Math.sin(angle)
        );
        
        // Add string to balloon
        const stringGeometry = new THREE.CylinderGeometry(0.01, 0.01, balloon.position.y - 0.3);
        const stringMaterial = new THREE.MeshStandardMaterial({
            color: 0xeeeeee,
            roughness: 0.5
        });
        
        const string = new THREE.Mesh(stringGeometry, stringMaterial);
        string.position.set(
            balloon.position.x,
            balloon.position.y / 2 - 0.15,
            balloon.position.z
        );
        
        group.add(balloon);
        group.add(string);
    }
    
    group.position.set(x, y, z);
    scene.add(group);
    
    // Add to furniture array to prevent walking through balloon strings
    furniture.push({
        type: 'decoration',
        position: new THREE.Vector3(x, 0, z),
        dimensions: new THREE.Vector3(1, 3, 1),
        rotation: 0
    });
}

function createStreamers() {
    const streamerColors = [
        0xff3366, // Pink
        0x3366ff, // Blue
        0x33cc33, // Green
        0xffcc00, // Yellow
        0xff6600, // Orange
        0x9933ff  // Purple
    ];
    
    // Create streamers across the ceiling
    for (let i = 0; i < 10; i++) {
        createStreamer(
            -ROOM_WIDTH/2 + Math.random() * ROOM_WIDTH,
            ROOM_HEIGHT,
            -ROOM_LENGTH/2 + Math.random() * ROOM_LENGTH,
            streamerColors[Math.floor(Math.random() * streamerColors.length)]
        );
    }
}

function createStreamer(x, y, z, color) {
    const points = [];
    const segments = 20;
    const length = 5 + Math.random() * 5;
    const curve = Math.random() * 2;
    
    // Create a wavy line for the streamer
    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        points.push(new THREE.Vector3(
            curve * Math.sin(t * Math.PI * 2) * t,
            -t * length,
            curve * Math.cos(t * Math.PI * 2) * t
        ));
    }
    
    const streamerGeometry = new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(points),
        segments,
        0.05,
        8,
        false
    );
    
    const streamerMaterial = new THREE.MeshStandardMaterial({
        color: color,
        roughness: 0.5,
        metalness: 0.2,
        side: THREE.DoubleSide
    });
    
    const streamer = new THREE.Mesh(streamerGeometry, streamerMaterial);
    streamer.position.set(x, y, z);
    streamer.rotation.y = Math.random() * Math.PI * 2;
    
    scene.add(streamer);
}

function createGiftBoxes() {
    // Create a few gift boxes around the museum
    createGiftBox(-ROOM_WIDTH/3, 0, -ROOM_LENGTH/3, 0.8, 0.5, 0.8, 0xff3366, 0xffffff);
    createGiftBox(ROOM_WIDTH/3, 0, -ROOM_LENGTH/3, 0.7, 0.6, 0.7, 0x3366ff, 0xffcc00);
    createGiftBox(0, 0, ROOM_LENGTH/3, 0.9, 0.4, 0.6, 0x33cc33, 0xff6600);
    
    // Create a stack of gifts in one corner
    createGiftBox(-ROOM_WIDTH/2 + 2, 0, -ROOM_LENGTH/2 + 2, 1, 0.6, 0.8, 0x9933ff, 0xffffff);
    createGiftBox(-ROOM_WIDTH/2 + 2, 0.6, -ROOM_LENGTH/2 + 2, 0.7, 0.4, 0.6, 0xff6600, 0x3366ff);
    createGiftBox(-ROOM_WIDTH/2 + 2, 1.0, -ROOM_LENGTH/2 + 2, 0.5, 0.3, 0.5, 0xffcc00, 0x33cc33);
}

function createGiftBox(x, y, z, width, height, depth, boxColor, ribbonColor) {
    const group = new THREE.Group();
    
    // Create box
    const boxGeometry = new THREE.BoxGeometry(width, height, depth);
    const boxMaterial = new THREE.MeshStandardMaterial({
        color: boxColor,
        roughness: 0.4,
        metalness: 0.3
    });
    
    const box = new THREE.Mesh(boxGeometry, boxMaterial);
    group.add(box);
    
    // Create ribbon around the box
    const ribbonWidth = 0.1;
    
    // Horizontal ribbon
    const horizontalRibbon = new THREE.Mesh(
        new THREE.BoxGeometry(width + 0.01, ribbonWidth, depth + 0.01),
        new THREE.MeshStandardMaterial({
            color: ribbonColor,
            roughness: 0.3,
            metalness: 0.5
        })
    );
    horizontalRibbon.position.y = 0;
    group.add(horizontalRibbon);
    
    // Vertical ribbon
    const verticalRibbon = new THREE.Mesh(
        new THREE.BoxGeometry(ribbonWidth, height + 0.01, depth + 0.01),
        new THREE.MeshStandardMaterial({
            color: ribbonColor,
            roughness: 0.3,
            metalness: 0.5
        })
    );
    verticalRibbon.position.x = 0;
    group.add(verticalRibbon);
    
    // Create bow on top
    if (Math.random() > 0.5) {
        const bowSize = 0.2;
        const bowGeometry = new THREE.TorusGeometry(bowSize, bowSize / 4, 8, 16, Math.PI);
        const bowMaterial = new THREE.MeshStandardMaterial({
            color: ribbonColor,
            roughness: 0.3,
            metalness: 0.5
        });
        
        // Left bow loop
        const leftBow = new THREE.Mesh(bowGeometry, bowMaterial);
        leftBow.position.set(-bowSize/2, height/2 + bowSize/2, 0);
        leftBow.rotation.set(0, 0, Math.PI/2);
        group.add(leftBow);
        
        // Right bow loop
        const rightBow = new THREE.Mesh(bowGeometry, bowMaterial);
        rightBow.position.set(bowSize/2, height/2 + bowSize/2, 0);
        rightBow.rotation.set(0, 0, -Math.PI/2);
        group.add(rightBow);
    }
    
    group.position.set(x, y + height/2, z);
    group.rotation.y = Math.random() * Math.PI/2;
    
    scene.add(group);
    
    // Add to furniture array for collision detection
    furniture.push({
        type: 'decoration',
        position: new THREE.Vector3(x, y + height/2, z),
        dimensions: new THREE.Vector3(width, height, depth),
        rotation: group.rotation.y
    });
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function findNearestArtwork() {
    const cameraPosition = camera.position;
    const cameraDirection = new THREE.Vector3();
    camera.getWorldDirection(cameraDirection);
    
    let nearestArtwork = null;
    let bestScore = -Infinity; // Higher score means better candidate
    
    artworks.forEach(artwork => {
        // Skip artworks that haven't been fully loaded yet
        if (artwork.width === undefined || artwork.height === undefined) {
            return;
        }
        
        const artworkPosition = artwork.group.position;
        const distance = cameraPosition.distanceTo(artworkPosition);
        
        // Calculate a viewing distance threshold based on artwork size
        // Larger artworks can be viewed from further away
        const sizeBasedThreshold = Math.max(artwork.width, artwork.height) * 3;
        const maxDistance = Math.max(10, sizeBasedThreshold);
        
        if (distance < maxDistance) { // Consider artworks within size-adjusted distance
            const toArtwork = artworkPosition.clone().sub(cameraPosition).normalize();
            const angle = cameraDirection.angleTo(toArtwork);
            
            // Adjust angle threshold based on size - larger artworks are easier to notice
            const sizeAdjustedAngleThreshold = Math.PI / 4 * (1 + Math.min(artwork.width, artwork.height) / 5);
            
            if (angle < sizeAdjustedAngleThreshold) {
                // Score based on combination of angle and distance, with size as a factor
                // Lower angle and distance is better, larger size makes artwork more noticeable
                const artworkSize = Math.max(artwork.width, artwork.height);
                const score = (1 - angle / Math.PI) * 10 + (maxDistance - distance) + artworkSize;
                
                if (score > bestScore) {
                    bestScore = score;
                    nearestArtwork = artwork;
                }
            }
        }
    });
    
    return nearestArtwork;
}

function onKeyDown(event) {
    // If in zoom mode, only handle ESC and V keys
    if (isZooming) {
        switch (event.code) {
            case 'KeyV':
            case 'Escape':
                resetZoom();
                break;
        }
        return;
    }
    
    // Normal movement controls when not in zoom mode
    switch (event.code) {
        case 'KeyW':
            moveForward = true;
            break;
        case 'KeyA':
            moveLeft = true;
            break;
        case 'KeyS':
            moveBackward = true;
            break;
        case 'KeyD':
            moveRight = true;
            break;
        case 'Space':
            if (canJump) {
                isJumping = true;
                canJump = false;
                jumpVelocity = JUMP_FORCE;
            }
            break;
        case 'KeyV':
            const nearestArtwork = findNearestArtwork();
            if (nearestArtwork) {
                zoomToArtwork(nearestArtwork);
            }
            break;
    }
}

function onKeyUp(event) {
    switch (event.code) {
        case 'KeyW':
            moveForward = false;
            break;
        case 'KeyA':
            moveLeft = false;
            break;
        case 'KeyS':
            moveBackward = false;
            break;
        case 'KeyD':
            moveRight = false;
            break;
    }
}

// Add a debug function to log important information
function debugLog(message, obj = null) {
    const DEBUG = true; // Set to false to disable debug messages
    if (DEBUG) {
        if (obj) {
            console.log(message, obj);
        } else {
            console.log(message);
        }
    }
}

function zoomToArtwork(artwork) {
    // Only proceed if we're not already zooming
    if (isZooming) return;
    
    debugLog("Zooming to artwork:", artwork.title);
    
    // Store original camera position and rotation before zooming
    // Make a deep copy to ensure we don't modify these values later
    originalCameraPosition = camera.position.clone();
    originalCameraRotation = new THREE.Euler().copy(camera.rotation);
    
    debugLog("Original position stored:", originalCameraPosition);
    
    isZooming = true;
    controls.unlock();
    
    // Calculate position in front of artwork
    // Adjust the viewing distance based on the artwork's size
    // Larger artworks need more distance to be viewed properly
    const viewingDistance = Math.max(1.5, Math.max(artwork.width, artwork.height) * 0.8);
    
    // Calculate the direction from the artwork to the viewing position
    const offset = new THREE.Vector3(0, 0, viewingDistance);
    offset.applyQuaternion(artwork.group.quaternion);
    
    // Calculate target position
    const targetPosition = artwork.group.position.clone().sub(offset);
    
    // Ensure the target position is inside the museum
    targetPosition.x = Math.max(-ROOM_WIDTH/2 + 1.5, Math.min(ROOM_WIDTH/2 - 1.5, targetPosition.x));
    targetPosition.z = Math.max(-ROOM_LENGTH/2 + 1.5, Math.min(ROOM_LENGTH/2 - 1.5, targetPosition.z));
    targetPosition.y = ROOM_HEIGHT/2 - 1; // Set to eye level, slightly below ceiling
    
    debugLog("Zoom target position:", targetPosition);
    
    // Move camera to the target position
    camera.position.copy(targetPosition);
    
    // Look at artwork
    camera.lookAt(artwork.group.position);
    
    // Display artwork information
    const artworkInfo = document.getElementById('artwork-info');
    artworkInfo.querySelector('h2').textContent = artwork.title;
    
    // Update the love message
    document.getElementById('love-message').textContent = artwork.description;
    
    // Show the artwork info panel
    artworkInfo.style.display = 'block';
}

function resetZoom() {
    debugLog("Resetting zoom");
    debugLog("Original position to restore:", originalCameraPosition);
    
    let validPosition;
    
    if (!originalCameraPosition || !originalCameraRotation) {
        debugLog("No original position stored, using default");
        // If we don't have stored positions (shouldn't happen), just reset to a default
        validPosition = new THREE.Vector3(0, 2, 0);
    } else {
        // Start with the original camera position
        validPosition = originalCameraPosition.clone();
        
        // Ensure the position is inside the museum bounds
        validPosition.x = Math.max(-ROOM_WIDTH/2 + 1, Math.min(ROOM_WIDTH/2 - 1, validPosition.x));
        validPosition.z = Math.max(-ROOM_LENGTH/2 + 1, Math.min(ROOM_LENGTH/2 - 1, validPosition.z));
        validPosition.y = Math.max(2, validPosition.y); // Ensure we're at least at ground level
        
        debugLog("Validated position:", validPosition);
        
        // Check if the position would cause a furniture collision
        if (checkFurnitureCollision(validPosition)) {
            debugLog("Furniture collision detected, finding safe position");
            // If there's a collision, find a safe position nearby
            const safePositions = [
                new THREE.Vector3(0, 2, 0),                      // Center of room
                new THREE.Vector3(-ROOM_WIDTH/4, 2, 0),          // Left side
                new THREE.Vector3(ROOM_WIDTH/4, 2, 0),           // Right side
                new THREE.Vector3(0, 2, -ROOM_LENGTH/4),         // Back side
                new THREE.Vector3(0, 2, ROOM_LENGTH/4)           // Front side
            ];
            
            // Find the closest safe position
            let closestSafePosition = safePositions[0];
            let minDistance = validPosition.distanceTo(safePositions[0]);
            
            for (let i = 1; i < safePositions.length; i++) {
                const distance = validPosition.distanceTo(safePositions[i]);
                if (distance < minDistance && !checkFurnitureCollision(safePositions[i])) {
                    minDistance = distance;
                    closestSafePosition = safePositions[i];
                }
            }
            
            validPosition = closestSafePosition;
            debugLog("Using safe position:", validPosition);
        }
    }
    
    // Set the camera position to the valid position
    camera.position.copy(validPosition);
    
    // Restore original rotation if available
    if (originalCameraRotation) {
        camera.rotation.copy(originalCameraRotation);
    }
    
    isZooming = false;
    controls.lock();
    
    // Hide artwork information
    document.getElementById('artwork-info').style.display = 'none';
    
    // Reset the stored positions
    originalCameraPosition = null;
    originalCameraRotation = null;
    
    debugLog("Zoom reset complete, new position:", camera.position);
}

function checkFurnitureCollision(newPosition) {
    for (let item of furniture) {
        const dx = newPosition.x - item.position.x;
        const dz = newPosition.z - item.position.z;
        
        // Adjust bounds based on rotation for benches
        let xBound = item.dimensions.x / 2;
        let zBound = item.dimensions.z / 2;
        
        if (item.type === 'bench' && item.rotation !== 0) {
            // Swap bounds if bench is rotated
            [xBound, zBound] = [zBound, xBound];
        }
        
        // Check if we're within the horizontal bounds of the furniture
        if (Math.abs(dx) < xBound + 0.3 && Math.abs(dz) < zBound + 0.3) {
            // For benches, we need more sophisticated collision detection
            if (item.type === 'bench') {
                // Get the player's height relative to the ground
                const playerHeight = newPosition.y;
                const benchSeatHeight = 1.0; // Height of bench seat from ground
                const benchTotalHeight = 1.0; // Total height of bench
                
                // Case 1: Player is clearly above the bench (jumping over it)
                if (playerHeight > benchTotalHeight + 1.0) {
                    return false; // Allow movement if jumping over
                }
                
                // Case 2: Player is standing on the bench
                if (Math.abs(playerHeight - 3) < 0.1) {
                    // Only allow movement on top of the bench surface
                    // Make the collision area slightly smaller than the bench to prevent edge issues
                    const topSurfaceXBound = xBound - 0.1;
                    const topSurfaceZBound = zBound - 0.1;
                    
                    if (Math.abs(dx) < topSurfaceXBound && Math.abs(dz) < topSurfaceZBound) {
                        return false; // Allow movement on bench surface
                    } else {
                        return true; // Collision at edges of bench
                    }
                }
                
                // Case 3: Player is at normal height and trying to walk through the bench
                if (playerHeight <= benchTotalHeight + 1.0) {
                    // Check if player is trying to walk through the bench legs or seat
                    // For simplicity, we'll treat the entire bench as solid at normal height
                    return true; // Collision detected - can't walk through bench
                }
            } else {
                // For other furniture types, just use simple collision
                return true; // Collision detected
            }
        }
    }
    return false; // No collision
}

// Emergency reset function to get back inside the museum
function emergencyReset() {
    // Reset zoom state if needed
    if (isZooming) {
        resetZoom();
    }
    
    // Force position to center of museum
    camera.position.set(0, 2, 0);
    
    // Reset controls and movement state
    controls.getObject().position.set(0, 2, 0);
    velocity.set(0, 0, 0);
    direction.set(0, 0, 0);
    moveForward = false;
    moveBackward = false;
    moveLeft = false;
    moveRight = false;
    
    // Ensure controls are locked for navigation
    if (!controls.isLocked) {
        controls.lock();
    }
    
    debugLog("Emergency reset complete");
}

function animate() {
    requestAnimationFrame(animate);

    // Check if player is outside the museum bounds and fix if needed
    if (!isZooming && camera.position.y < 0 || 
        camera.position.x < -ROOM_WIDTH/2 - 5 || 
        camera.position.x > ROOM_WIDTH/2 + 5 || 
        camera.position.z < -ROOM_LENGTH/2 - 5 || 
        camera.position.z > ROOM_LENGTH/2 + 5) {
        debugLog("Player detected outside museum bounds, performing emergency reset");
        emergencyReset();
    }

    // Only process movement if controls are locked and not in zoom mode
    if (controls.isLocked && !isZooming) {
        const time = performance.now();
        const delta = (time - prevTime) / 1000;

        velocity.x -= velocity.x * 10.0 * delta;
        velocity.z -= velocity.z * 10.0 * delta;

        // Handle jumping and gravity
        if (isJumping) {
            // Apply gravity to jump velocity
            jumpVelocity += GRAVITY * delta;
            camera.position.y += jumpVelocity * delta;

            // Check for landing on benches
            let landedOnBench = false;
            if (jumpVelocity < 0) { // Only check when falling
                for (let item of furniture) {
                    if (item.type === 'bench') {
                        const dx = camera.position.x - item.position.x;
                        const dz = camera.position.z - item.position.z;
                        
                        // Adjust bounds based on rotation
                        let xBound = item.dimensions.x / 2;
                        let zBound = item.dimensions.z / 2;
                        
                        if (item.rotation !== 0) {
                            [xBound, zBound] = [zBound, xBound];
                        }
                        
                        // Make the landing area slightly smaller than the bench to prevent edge issues
                        const landingXBound = xBound - 0.2;
                        const landingZBound = zBound - 0.2;
                        
                        // Check if we're above the bench and within its bounds
                        if (Math.abs(dx) < landingXBound && Math.abs(dz) < landingZBound && 
                            camera.position.y <= 3 && camera.position.y > 2) {
                            camera.position.y = 3; // Set height to top of bench
                            isJumping = false;
                            canJump = true;
                            jumpVelocity = 0;
                            landedOnBench = true;
                            break;
                        }
                    }
                }
            }

            // Check if we've landed on the ground
            if (!landedOnBench && camera.position.y <= 2) {
                camera.position.y = 2;
                isJumping = false;
                canJump = true;
                jumpVelocity = 0;
            }
        } 
        // Check if we're standing on a bench (not jumping)
        else if (camera.position.y > 2) {
            // Check if we're still on a bench
            let onBench = false;
            
            for (let item of furniture) {
                if (item.type === 'bench') {
                    const dx = camera.position.x - item.position.x;
                    const dz = camera.position.z - item.position.z;
                    
                    // Adjust bounds based on rotation
                    let xBound = item.dimensions.x / 2;
                    let zBound = item.dimensions.z / 2;
                    
                    if (item.rotation !== 0) {
                        [xBound, zBound] = [zBound, xBound];
                    }
                    
                    // Make the standing area slightly smaller than the bench to prevent edge issues
                    const standingXBound = xBound - 0.2;
                    const standingZBound = zBound - 0.2;
                    
                    // Check if we're still within the bench bounds
                    if (Math.abs(dx) < standingXBound && Math.abs(dz) < standingZBound) {
                        onBench = true;
                        break;
                    }
                }
            }
            
            // If we're not on a bench anymore, fall to ground level
            if (!onBench) {
                debugLog("Walked off bench, returning to ground level");
                isJumping = true;
                jumpVelocity = 0; // Start falling immediately
            }
        }

        direction.z = Number(moveForward) - Number(moveBackward);
        direction.x = Number(moveRight) - Number(moveLeft);
        direction.normalize();

        const speed = 50.0;
        
        // Calculate new position before moving
        const newPosition = camera.position.clone();
        if (moveForward || moveBackward) {
            newPosition.z -= direction.z * speed * delta;
        }
        if (moveLeft || moveRight) {
            newPosition.x -= direction.x * speed * delta;
        }

        // Check both wall and furniture collisions
        const hasWallCollision = (
            newPosition.x < -ROOM_WIDTH/2 + 1 ||
            newPosition.x > ROOM_WIDTH/2 - 1 ||
            newPosition.z < -ROOM_LENGTH/2 + 1 ||
            newPosition.z > ROOM_LENGTH/2 - 1
        );

        // Pass current height to collision check
        newPosition.y = camera.position.y;
        const hasFurnitureCollision = checkFurnitureCollision(newPosition);

        // Only move if no collisions
        if (!hasWallCollision && !hasFurnitureCollision) {
            if (moveForward || moveBackward) velocity.z -= direction.z * speed * delta;
            if (moveLeft || moveRight) velocity.x -= direction.x * speed * delta;

            controls.moveRight(-velocity.x * delta);
            controls.moveForward(-velocity.z * delta);
        } else {
            // If there's a collision, try sliding along the collision surface
            // This helps prevent getting stuck against furniture
            const slidePositionX = camera.position.clone();
            slidePositionX.x = newPosition.x;
            slidePositionX.y = camera.position.y;
            
            const slidePositionZ = camera.position.clone();
            slidePositionZ.z = newPosition.z;
            slidePositionZ.y = camera.position.y;
            
            // Try to slide in X direction
            if ((moveForward || moveBackward) && !checkFurnitureCollision(slidePositionX) && 
                slidePositionX.x >= -ROOM_WIDTH/2 + 1 && slidePositionX.x <= ROOM_WIDTH/2 - 1) {
                controls.moveRight(-velocity.x * delta);
            }
            
            // Try to slide in Z direction
            if ((moveLeft || moveRight) && !checkFurnitureCollision(slidePositionZ) && 
                slidePositionZ.z >= -ROOM_LENGTH/2 + 1 && slidePositionZ.z <= ROOM_LENGTH/2 - 1) {
                controls.moveForward(-velocity.z * delta);
            }
        }

        prevTime = time;
    } else if (!controls.isLocked) {
        // When controls are unlocked (in zoom mode), still update the time
        prevTime = performance.now();
    }

    renderer.render(scene, camera);
} 