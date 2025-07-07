// Importaciones Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.8.0/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/11.8.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  query,
  where,
  updateDoc,
  doc,
  setDoc,
  getDoc
} from "https://www.gstatic.com/firebasejs/11.8.0/firebase-firestore.js";

// Config y init Firebase (Tus credenciales reales de Firebase ya deben estar aquí)
const firebaseConfig = {
    apiKey: "AIzaSyBRo2ZoKk-XbgPkNl1BOtRcGhSB4JEuocM",
  authDomain: "mi-potrero-partidos.firebaseapp.com",
  projectId: "mi-potrero-partidos",
  storageBucket: "mi-potrero-partidos.firebasestorage.app",
  messagingSenderId: "555922222113",
  appId: "1:555922222113:web:dd2f79d5e20f0d96cac760",
  measurementId: "G-7LBJ29RXKM"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const partidosCol = collection(db, "partidos");
const usuariosCol = collection(db, "usuarios");

// --- Variables para Google Maps (ELIMINADAS) ---
// let autocomplete;
// let map;
// let marker;

// SE ELIMINA LA FUNCIÓN initMap()

// --- Variables para SPA ---
const allSections = document.querySelectorAll('main section');
const navLinks = document.querySelectorAll('.nav-link');
const cuentaSection = document.getElementById('cuenta-section');

// --- Funciones de Utilidad ---
function mostrarMensaje(mensaje, tipo = "exito", targetDivId = "global-mensaje") {
  const mensajeDiv = document.getElementById(targetDivId);
  if (mensajeDiv) {
    mensajeDiv.textContent = mensaje;
    mensajeDiv.className = `mensaje ${tipo}`;
    setTimeout(() => {
      mensajeDiv.textContent = "";
      mensajeDiv.className = "mensaje";
    }, 3000);
  }
}

function hideAllSections() {
  allSections.forEach(section => {
    section.classList.add('hidden');
    section.classList.remove('active-section');
  });
}

function showSection(sectionId) {
  hideAllSections();
  const sectionToShow = document.getElementById(sectionId);
  if (sectionToShow) {
    sectionToShow.classList.remove('hidden');
    sectionToShow.classList.add('active-section');
  }
}

// --- Lógica de Navegación (SPA Router) ---
function navigateTo(path) {
  const user = auth.currentUser;

  // Limpiar el estado del formulario "Crear Partido" al salir de él
  if (path !== 'crear') {
    const lugarInput = document.getElementById('lugar');
    // const mapElement = document.getElementById('map'); // El mapa ya no existe
    if (lugarInput) {
      lugarInput.value = '';
      // lugarInput.removeAttribute('data-place-id'); // Este atributo ya no se usa
    }
    // if (mapElement) { // El mapa ya no existe
    //   mapElement.style.display = 'none';
    // }
    const mensajeCrear = document.getElementById('mensaje-crear');
    if (mensajeCrear) mensajeCrear.textContent = '';
  }


  // Bloquear acceso a secciones protegidas si no hay usuario
  if (['explorar', 'crear', 'partidos', 'torneo'].includes(path) && !user) {
    mostrarMensaje("Inicia sesión primero para acceder a esta sección.", "error", "global-mensaje");
    history.pushState(null, '', '#cuenta');
    showSection('cuenta-section');
    return;
  }

  switch (path) {
    case 'explorar':
      showSection('explorar-section');
      break;
    case 'crear':
      showSection('crear-section');
      break;
    case 'partidos':
      showSection('partidos-section');
      cargarPartidos();
      cargarMisPartidos();
      break;
    case 'cuenta':
      showSection('cuenta-section');
      break;
    case 'torneo':
      showSection('torneo-section');
      break;
    default:
      history.replaceState(null, '', '#cuenta');
      showSection('cuenta-section');
  }
  if (window.location.hash !== `#${path}`) {
    history.pushState(null, '', `#${path}`);
  }
}

// --- Manejo de la Barra Lateral ---
navLinks.forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const path = link.getAttribute('href').substring(1);
    navigateTo(path);
  });
});

window.addEventListener('popstate', () => {
  const path = window.location.hash.substring(1) || 'cuenta';
  navigateTo(path);
});

// --- Lógica de Autenticación para Cuenta ---
function renderAuthForm(isLogin = false) {
  cuentaSection.innerHTML = `
    <h2>${isLogin ? 'Iniciar Sesión' : 'Registrarse'}</h2>
    <form id="${isLogin ? 'login-form' : 'register-form'}">
      <input type="email" id="auth-email" placeholder="Email" required>
      <input type="password" id="auth-password" placeholder="Contraseña" required>
      ${!isLogin ? '<input type="text" id="auth-nombre" placeholder="Tu Nombre de Jugador" required>' : ''}
      <p>${isLogin ? '¿No tienes una cuenta? <a href="#" id="toggle-register">Registrarse.</a>' : '¿Ya tienes una cuenta? <a href="#" id="toggle-login">Iniciar Sesión.</a>'}</p>
      <span class="material-symbols-outlined form-icon">stadium</span>
      <button type="submit">${isLogin ? 'Iniciar Sesión' : 'Registrarse'}</button>
    </form>
  `;
  setupAuthForms();
}

function setupAuthForms() {
  const registerForm = document.getElementById("register-form");
  const loginForm = document.getElementById("login-form");
  const toggleLoginLink = document.getElementById("toggle-login");
  const toggleRegisterLink = document.getElementById("toggle-register");

  if (registerForm) {
    registerForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = registerForm.querySelector('#auth-email').value;
      const password = registerForm.querySelector('#auth-password').value;
      const nombre = registerForm.querySelector('#auth-nombre').value.trim();

      if (!nombre) {
        mostrarMensaje("Por favor, introduce tu nombre de jugador.", "error", "global-mensaje");
        return;
      }

      try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        await updateProfile(user, { displayName: nombre });

        await setDoc(doc(db, "usuarios", user.uid), {
          email: user.email,
          nombre: nombre,
          uid: user.uid
        });

        mostrarMensaje("Cuenta creada correctamente. ¡Bienvenido, " + nombre + "!", "exito", "global-mensaje");
      } catch (error) {
        mostrarMensaje("Error al crear cuenta: " + error.message, "error", "global-mensaje");
      }
    });
  }

  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = loginForm.querySelector('#auth-email').value;
      const password = loginForm.querySelector('#auth-password').value;
      try {
        await signInWithEmailAndPassword(auth, email, password);
        mostrarMensaje("Sesión iniciada correctamente. ¡Bienvenido!", "exito", "global-mensaje");
      } catch (error) {
        mostrarMensaje("Error al iniciar sesión: " + error.message, "error", "global-mensaje");
      }
    });
  }

  if (toggleLoginLink) {
    toggleLoginLink.addEventListener("click", (e) => {
      e.preventDefault();
      renderAuthForm(true);
    });
  }

  if (toggleRegisterLink) {
    toggleRegisterLink.addEventListener("click", (e) => {
      e.preventDefault();
      renderAuthForm(false);
    });
  }
}

async function displayUserProfile(user) {
  let userName = user.displayName;

  if (!userName && user.uid) {
    const userDocRef = doc(db, "usuarios", user.uid);
    const userDocSnap = await getDoc(userDocRef);
    if (userDocSnap.exists() && userDocSnap.data().nombre) {
      userName = userDocSnap.data().nombre;
    }
  }
  if (!userName) {
    userName = user.email;
  }

  cuentaSection.innerHTML = `
    <h2>Mi perfil</h2>
    <p><strong>Email:</strong> ${user.email}</p>
    <p><strong>Nombre de Jugador:</strong> <span id="display-user-name">${userName}</span></p>
    <input type="text" id="edit-user-name" placeholder="Actualizar nombre" value="${userName}" style="display:none; margin-bottom: 10px;">
    <button id="btn-edit-name" style="margin-right: 10px;">Editar Nombre</button>
    <button id="btn-save-name" style="display:none; margin-right: 10px;">Guardar Nombre</button>
    <button id="cerrarSesion">Cerrar sesión</button>
  `;

  const btnEditName = document.getElementById('btn-edit-name');
  const btnSaveName = document.getElementById('btn-save-name');
  const editUserNameInput = document.getElementById('edit-user-name');
  const displayUserNameSpan = document.getElementById('display-user-name');

  btnEditName.addEventListener('click', () => {
    displayUserNameSpan.style.display = 'none';
    btnEditName.style.display = 'none';
    editUserNameInput.style.display = 'inline-block';
    btnSaveName.style.display = 'inline-block';
    editUserNameInput.focus();
    editUserNameInput.select();
  });

  btnSaveName.addEventListener('click', async () => {
    const newName = editUserNameInput.value.trim();
    if (newName && user) {
      try {
        await updateProfile(user, { displayName: newName });
        await setDoc(doc(db, "usuarios", user.uid), { nombre: newName }, { merge: true });
        
        mostrarMensaje("Nombre actualizado correctamente.", "exito", "global-mensaje");
        displayUserProfile(user); 
        if (window.location.hash.substring(1) === 'partidos') {
            cargarPartidos();
            cargarMisPartidos();
        }
      }
       catch (error) { // Error si se actualiza el nombre
        mostrarMensaje("Error al actualizar nombre: " + error.message, "error", "global-mensaje");
      }
    } else {
      mostrarMensaje("Por favor, introduce un nombre válido.", "error", "global-mensaje");
    }
  });

  document.getElementById("cerrarSesion").addEventListener("click", () => {
    signOut(auth).then(() => {
      mostrarMensaje("Sesión cerrada.", "exito", "global-mensaje");
    }).catch(e => mostrarMensaje("Error al cerrar sesión: " + e.message, "error", "global-mensaje"));
  });
}

onAuthStateChanged(auth, user => {
  if (user) {
    displayUserProfile(user);
    const currentHash = window.location.hash.substring(1);
    if (currentHash === '' || currentHash === 'cuenta') {
        navigateTo('partidos');
    } else {
        navigateTo(currentHash);
    }
  } else {
    renderAuthForm(false);
    const currentHash = window.location.hash.substring(1);
    if (['explorar', 'crear', 'partidos', 'torneo'].includes(currentHash)) {
        navigateTo('cuenta');
    }
  }
});

// --- Funciones de Partidos ---

async function getUserNameByEmail(userEmail) {
    if (!userEmail) return "Desconocido";
    try {
        const q = query(usuariosCol, where("email", "==", userEmail));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
            return querySnapshot.docs[0].data().nombre || userEmail;
        }
    } catch (error) {
        console.error("Error al obtener nombre por email:", error);
    }
    return userEmail;
}

async function cargarPartidos() {
  const lista = document.getElementById("lista-partidos");
  if (!lista) return;
  lista.innerHTML = "";

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  getDocs(partidosCol).then(async snapshot => {
    if (snapshot.empty) {
      lista.innerHTML = "<p>No hay partidos disponibles en este momento.</p>";
      return;
    }
    for (const doc of snapshot.docs) {
      const p = doc.data();
      const fechaPartido = new Date(p.fecha);
      if (fechaPartido < hoy) continue;

      const div = document.createElement("div");
      div.className = "partido";
      const fechaFormateada = fechaPartido.toLocaleString();
      let jugadoresActuales = p.jugadores ? p.jugadores.length : 0;
      
      const nombresJugadoresPromises = p.jugadores.map(email => getUserNameByEmail(email));
      const nombresJugadores = await Promise.all(nombresJugadoresPromises);

      const jugadoresListItems = nombresJugadores && nombresJugadores.length > 0
        ? nombresJugadores.map(nombre => `<li>${nombre}</li>`).join('')
        : '<li>Nadie se ha unido aún.</li>';

      div.innerHTML = `
        <h3>${p.lugar}</h3>
        <p class="fecha-partido"><strong>Fecha:</strong> ${fechaFormateada}</p>
        <p class="descripcion-partido">${p.descripcion}</p>
        <p class="cupos-partido"><strong>Jugadores:</strong> ${jugadoresActuales} / ${p.cupos}</p>
        <div class="jugadores-list">
          <strong>Inscritos:</strong>
          <ul>
            ${jugadoresListItems}
          </ul>
        </div>
      `;

      if (auth.currentUser) {
        const isJoined = p.jugadores.includes(auth.currentUser.email);

        if (!isJoined) {
          const btn = document.createElement("button");
          btn.textContent = "Unirse";
          btn.onclick = () => unirseAPartido(doc.id, p);
          div.appendChild(btn);
        } else {
          const spanUnido = document.createElement("span");
          spanUnido.textContent = "¡Ya estás unido!";
          spanUnido.style.color = "green";
          div.appendChild(spanUnido);
        }
      }
      lista.appendChild(div);
    }
  }).catch(e => mostrarMensaje("Error al cargar partidos: " + e.message, "error", "global-mensaje"));
}

async function crearPartido() {
  const lugarInput = document.getElementById("lugar");
  const lugar = lugarInput.value.trim();
  // const placeId = lugarInput.getAttribute('data-place-id'); // ELIMINADO
  const fechaInput = document.getElementById("fecha").value;
  const cupos = parseInt(document.getElementById("cupos").value);
  const descripcion = document.getElementById("descripcion").value.trim();
  const currentUser = auth.currentUser;

  if (!lugar || !fechaInput || isNaN(cupos) || cupos < 1) {
    mostrarMensaje("Por favor, completa todos los campos correctamente.", "error", "mensaje-crear");
    return;
  }
  if (!currentUser) {
      mostrarMensaje("Debes iniciar sesión para crear un partido.", "error", "mensaje-crear");
      return;
  }
  if (!currentUser.displayName) {
      mostrarMensaje("Por favor, establece tu nombre de jugador en la sección 'Cuenta' antes de crear un partido.", "error", "mensaje-crear");
      navigateTo('cuenta');
      return;
  }

  // SE ELIMINA LA VALIDACIÓN DEL placeId
  // if (!placeId) {
  //     mostrarMensaje("Por favor, selecciona un lugar válido del autocompletado de Google Maps.", "error", "mensaje-crear");
  //     return;
  // }

  const fecha = new Date();
  fecha.setHours(0, 0, 0, 0); // Ajusta la fecha actual a las 00:00:00 para la comparación
  
  const fechaSeleccionada = new Date(fechaInput);

  if (fechaSeleccionada < fecha) {
    mostrarMensaje("No puedes crear partidos en fechas pasadas.", "error", "mensaje-crear");
    return;
  }

  const maxFecha = new Date();
  maxFecha.setDate(fecha.getDate() + 30); // Usar 'fecha' aquí para asegurar 30 días desde el día actual, no la hora actual
  maxFecha.setHours(23, 59, 59, 999); // Establecer al final del día para la comparación

  if (fechaSeleccionada > maxFecha) {
    mostrarMensaje("No puedes crear partidos con más de 30 días de anticipación.", "error", "mensaje-crear");
    return;
  }
  
  const partido = {
    lugar: lugar,
    // placeId: placeId, // ELIMINADO
    fecha: fechaSeleccionada.toISOString(), // Usar fechaSeleccionada
    cupos,
    descripcion,
    creador: currentUser.email,
    jugadores: [currentUser.email]
  };

  addDoc(partidosCol, partido).then(() => {
    mostrarMensaje("¡Partido creado exitosamente!", "exito", "global-mensaje");
    lugarInput.value = '';
    // lugarInput.removeAttribute('data-place-id'); // Este atributo ya no se usa
    // SE ELIMINA LA LÍNEA PARA OCULTAR EL MAPA
    document.getElementById("fecha").value = '';
    document.getElementById("cupos").value = '';
    document.getElementById("descripcion").value = '';
    navigateTo('partidos');
  }).catch(e => mostrarMensaje("Error al crear partido: " + e.message, "error", "mensaje-crear"));
}

async function cargarMisPartidos() {
  const cont = document.getElementById("mis-partidos");
  if (!cont) return;
  cont.innerHTML = "";
  const currentUser = auth.currentUser;
  if (!currentUser) {
      cont.innerHTML = "<p>Inicia sesión para ver tus partidos.</p>";
      return;
  }

  const q = query(partidosCol, where("jugadores", "array-contains", currentUser.email));
  getDocs(q).then(async snapshot => {
    if (snapshot.empty) {
      cont.innerHTML = "<p>Aún no te has unido a ningún partido ni has creado uno.</p>";
      return;
    }
    for (const doc of snapshot.docs) {
      const p = doc.data();
      const div = document.createElement("div");
      const fechaFormateada = new Date(p.fecha).toLocaleString();
      
      const nombresJugadoresPromises = p.jugadores.map(email => getUserNameByEmail(email));
      const nombresJugadores = await Promise.all(nombresJugadoresPromises);

      const jugadoresListItems = nombresJugadores && nombresJugadores.length > 0
        ? nombresJugadores.map(nombre => `<li>${nombre}</li>`).join('')
        : '<li>Nadie se ha unido aún.</li>';

      div.className = "partido";
      div.innerHTML = `
        <h3>${p.lugar}</h3>
        <p class="fecha-partido"><strong>Fecha:</strong> ${fechaFormateada}</p>
        <p class="descripcion-partido">${p.descripcion}</p>
        <p class="cupos-partido"><strong>Jugadores:</strong> ${p.jugadores.length} / ${p.cupos}</p>
        <div class="jugadores-list">
          <strong>Inscritos:</strong>
          <ul>
            ${jugadoresListItems}
          </ul>
        </div>
      `;
      cont.appendChild(div);
    }
  }).catch(e => mostrarMensaje("Error al cargar mis partidos: " + e.message, "error", "global-mensaje"));
}

window.unirseAPartido = async function(id, partido) {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    mostrarMensaje("Debes iniciar sesión para unirte a un partido.", "error", "global-mensaje");
    navigateTo('cuenta');
    return;
  }
  if (!currentUser.displayName) {
      mostrarMensaje("Por favor, establece tu nombre de jugador en la sección 'Cuenta' antes de unirte a un partido.", "error", "global-mensaje");
      navigateTo('cuenta');
      return;
  }

  if (partido.jugadores.includes(currentUser.email)) {
    mostrarMensaje("Ya estás unido a este partido.", "info", "global-mensaje");
    return;
  }
  if (partido.jugadores.length >= partido.cupos) {
    mostrarMensaje("El partido ya está lleno.", "error", "global-mensaje");
    return;
  }

  const nuevosJugadores = [...partido.jugadores, currentUser.email];
  const docRef = doc(db, "partidos", id);

  updateDoc(docRef, { jugadores: nuevosJugadores }).then(() => {
    mostrarMensaje("Te has unido al partido exitosamente!", "exito", "global-mensaje");
    cargarPartidos();
    cargarMisPartidos();
  }).catch(e => mostrarMensaje("Error al unirse al partido: " + e.message, "error", "global-mensaje"));
};

// Inicializar la aplicación: determina la página a mostrar al cargar
document.addEventListener('DOMContentLoaded', () => {
    const btnCrear = document.getElementById("btnCrear");
    if (btnCrear) {
        btnCrear.addEventListener("click", crearPartido);
    }
    const initialPath = window.location.hash.substring(1) || 'cuenta';
    navigateTo(initialPath);
});