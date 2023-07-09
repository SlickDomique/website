import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
const mouse = {
    x: 0,
    y: 0
  };
(function() {
    const loader = new GLTFLoader();

    // Optional: Provide a DRACOLoader instance to decode compressed mesh data
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath( '/examples/jsm/libs/draco/' );
    loader.setDRACOLoader( dracoLoader );

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera( 75, 1, 0.1, 1000 );

    const dingusPlace = document.getElementById("dingusPlace");

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize( 500, 500 );
    dingusPlace.appendChild(renderer.domElement);
    camera.position.z = 35;
    camera.position.y = 20;
    camera.rotation.x = -0.4;
    let dingus = null;
    
    const lightAmb = new THREE.AmbientLight(0xffffff);
    scene.add(lightAmb);
  
    document.addEventListener('mousemove', onMouseMove, false);
    function onMouseMove(event) {
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    };
      

    function animate() {
        requestAnimationFrame( animate );

        if (dingus) {
            dingus.rotation.y += mouse.x * 0.05;
            dingus.rotation.x += mouse.y * 0.001;
        }

        renderer.render( scene, camera );
    }
    animate();

    loader.load(
        // resource URL
        'assets/dingus_the_cat.glb',
        // called when the resource is loaded
        function ( gltf ) {
            dingus = gltf.scene;
            scene.add( gltf.scene );

            gltf.animations; // Array<THREE.AnimationClip>
            gltf.scene; // THREE.Group
            gltf.scenes; // Array<THREE.Group>
            gltf.cameras; // Array<THREE.Camera>
            gltf.asset; // Object
        }
    );
})();