// Importaciones Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.8.0/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/11.8.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  query,
  where,
  updateDoc,
  doc
} from "https://www.gstatic.com/firebasejs/11.8.0/firebase-firestore.js";

// Config y init Firebase
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

// --- Variables para SPA ---
const allSections = document.querySelectorAll('main section');
const navLinks = document.querySelectorAll('.nav-link');
const cuentaSection = document.getElementById('cuenta-section'); // La sección de autenticación/perfil

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

  // Bloquear acceso a secciones protegidas si no hay usuario
  if (['explorar', 'crear', 'partidos', 'torneo'].includes(path) && !user) {
    mostrarMensaje("Inicia sesión primero para acceder a esta sección.", "error", "global-mensaje");
    history.pushState(null, '', '#cuenta'); // Redirigir a la cuenta
    showSection('cuenta-section');
    return;
  }

  // Lógica para mostrar la sección correcta
  switch (path) {
    case 'explorar':
      showSection('explorar-section');
      // En este diseño, 'explorar' es solo informativo. Los partidos están en 'partidos'
      break;
    case 'crear':
      showSection('crear-section');
      // El listener para el botón de crear partido se adjunta al cargar la página
      // y no necesita ser re-adjuntado aquí a menos que el botón se re-renderice dinámicamente.
      break;
    case 'partidos': // Corresponde a la vista de "Mis Partidos" y "Partidos Disponibles"
      showSection('partidos-section');
      cargarPartidos(); // Carga partidos disponibles
      cargarMisPartidos(); // Carga mis partidos
      break;
    case 'cuenta':
      showSection('cuenta-section');
      // El onAuthStateChanged ya maneja lo que se muestra aquí (formulario o perfil)
      break;
    case 'torneo':
      showSection('torneo-section');
      break;
    default:
      // Si la URL no tiene hash o tiene un hash desconocido, redirige a #cuenta por defecto
      history.replaceState(null, '', '#cuenta');
      showSection('cuenta-section');
  }
  // Asegurarse de que el hash esté siempre presente en la URL si no es la ruta base
  if (window.location.hash !== `#${path}`) {
    history.pushState(null, '', `#${path}`);
  }
}

// --- Manejo de la Barra Lateral ---
navLinks.forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const path = link.getAttribute('href').substring(1); // Obtiene 'explorar', 'crear', etc.
    navigateTo(path);
  });
});

// Manejo de la navegación del navegador (botón atrás/adelante)
window.addEventListener('popstate', () => {
  const path = window.location.hash.substring(1) || 'cuenta';
  navigateTo(path);
});

// --- Lógica de Autenticación para Cuenta (index.html) ---
function renderAuthForm(isLogin = false) {
  cuentaSection.innerHTML = `
    <h2>${isLogin ? 'Iniciar Sesión' : 'Registrarse'}</h2>
    <form id="${isLogin ? 'login-form' : 'register-form'}">
      <input type="email" id="auth-email" placeholder="Email" required>
      <input type="password" id="auth-password" placeholder="Contraseña" required>
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
      try {
        await createUserWithEmailAndPassword(auth, email, password);
        mostrarMensaje("Cuenta creada correctamente. ¡Bienvenido!", "exito", "global-mensaje");
        // onAuthStateChanged se disparará después del registro exitoso
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
        // onAuthStateChanged se disparará después del inicio de sesión exitoso
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

function displayUserProfile(user) {
  cuentaSection.innerHTML = `
    <h2>Mi perfil</h2>
    <p><strong>Email:</strong> ${user.email}</p>
    <button id="cerrarSesion">Cerrar sesión</button>
  `;
  document.getElementById("cerrarSesion").addEventListener("click", () => {
    signOut(auth).then(() => {
      mostrarMensaje("Sesión cerrada.", "exito", "global-mensaje");
      // onAuthStateChanged se disparará y renderAuthForm(true) se llamará
    }).catch(e => mostrarMensaje("Error al cerrar sesión: " + e.message, "error", "global-mensaje"));
  });
}

// Manejar estado de autenticación globalmente
onAuthStateChanged(auth, user => {
  if (user) {
    displayUserProfile(user);
    // Si el usuario está logueado y está en la URL base o en #cuenta,
    // lo redirigimos a la página de partidos por defecto.
    // Esto evita que un usuario logueado siempre vea la pantalla de login/registro.
    const currentHash = window.location.hash.substring(1);
    if (currentHash === '' || currentHash === 'cuenta') {
        navigateTo('partidos');
    } else {
        // Si ya está en otra sección (ej. #explorar), simplemente asegura que se muestre.
        navigateTo(currentHash);
    }
  } else {
    renderAuthForm(false); // Muestra el formulario de registro/login si no está logueado
    // Si el usuario está en una página protegida y cierra sesión, lo redirigimos a la cuenta
    const currentHash = window.location.hash.substring(1);
    if (['explorar', 'crear', 'partidos', 'torneo'].includes(currentHash)) {
        navigateTo('cuenta');
    }
  }
});

// --- Funciones de Partidos (ahora llamadas por navigateTo) ---

// Función para cargar partidos (para la sección 'Partidos disponibles' en la vista 'partidos')
function cargarPartidos() {
  const lista = document.getElementById("lista-partidos");
  if (!lista) return;
  lista.innerHTML = ""; // Limpiar antes de cargar

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  getDocs(partidosCol).then(snapshot => {
    if (snapshot.empty) {
      lista.innerHTML = "<p>No hay partidos disponibles en este momento.</p>";
      return;
    }
    snapshot.forEach(doc => {
      const p = doc.data();
      const fechaPartido = new Date(p.fecha);
      if (fechaPartido < hoy) return; // No mostrar partidos pasados

      const div = document.createElement("div");
      div.className = "partido";
      const fechaFormateada = fechaPartido.toLocaleString();
      let jugadoresActuales = p.jugadores ? p.jugadores.length : 0;
      
      const jugadoresListItems = p.jugadores && p.jugadores.length > 0
        ? p.jugadores.map(jugador => `<li>${jugador}</li>`).join('')
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

      if (auth.currentUser && !p.jugadores.includes(auth.currentUser.email)) {
        const btn = document.createElement("button");
        btn.textContent = "Unirse";
        btn.onclick = () => unirseAPartido(doc.id, p);
        div.appendChild(btn);
      } else if (auth.currentUser && p.jugadores.includes(auth.currentUser.email)) {
        const spanUnido = document.createElement("span");
        spanUnido.textContent = "¡Ya estás unido!";
        spanUnido.style.color = "green";
        div.appendChild(spanUnido);
      }
      lista.appendChild(div);
    });
  }).catch(e => mostrarMensaje("Error al cargar partidos: " + e.message, "error", "global-mensaje"));
}

function crearPartido() {
  const lugar = document.getElementById("lugar").value.trim();
  const fechaInput = document.getElementById("fecha").value;
  const cupos = parseInt(document.getElementById("cupos").value);
  const descripcion = document.getElementById("descripcion").value.trim();

  if (!lugar || !fechaInput || isNaN(cupos) || cupos < 1) {
    mostrarMensaje("Por favor, completa todos los campos correctamente.", "error", "mensaje-crear");
    return;
  }

  const fecha = new Date(fechaInput);
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const maxFecha = new Date();
  maxFecha.setDate(hoy.getDate() + 30);

  if (fecha < hoy) {
    mostrarMensaje("No puedes crear partidos en fechas pasadas.", "error", "mensaje-crear");
    return;
  }

  if (fecha > maxFecha) {
    mostrarMensaje("No puedes crear partidos con más de 30 días de anticipación.", "error", "mensaje-crear");
    return;
  }

  const partido = {
    lugar,
    fecha: fecha.toISOString(),
    cupos,
    descripcion,
    creador: auth.currentUser.email,
    jugadores: [auth.currentUser.email]
  };

  addDoc(partidosCol, partido).then(() => {
    mostrarMensaje("¡Partido creado exitosamente!", "exito", "global-mensaje"); // Mensaje global después de redirigir
    // Redirigir a la vista de partidos después de crear
    navigateTo('partidos');
  }).catch(e => mostrarMensaje("Error al crear partido: " + e.message, "error", "mensaje-crear"));
}

// Función para cargar mis partidos (para la sección 'Mis partidos' en la vista 'partidos')
function cargarMisPartidos() {
  const cont = document.getElementById("mis-partidos");
  if (!cont) return;
  cont.innerHTML = "";

  const q = query(partidosCol, where("jugadores", "array-contains", auth.currentUser.email));
  getDocs(q).then(snapshot => {
    if (snapshot.empty) {
      cont.innerHTML = "<p>Aún no te has unido a ningún partido ni has creado uno.</p>";
      return;
    }
    snapshot.forEach(doc => {
      const p = doc.data();
      const div = document.createElement("div");
      const fechaFormateada = new Date(p.fecha).toLocaleString();
      
      const jugadoresListItems = p.jugadores && p.jugadores.length > 0
        ? p.jugadores.map(jugador => `<li>${jugador}</li>`).join('')
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
    });
  }).catch(e => mostrarMensaje("Error al cargar mis partidos: " + e.message, "error", "global-mensaje"));
}

window.unirseAPartido = function(id, partido) {
  if (!auth.currentUser) {
    mostrarMensaje("Debes iniciar sesión para unirte a un partido.", "error", "global-mensaje");
    navigateTo('cuenta'); // Redirige a la sección de cuenta
    return;
  }
  if (partido.jugadores.includes(auth.currentUser.email)) {
    mostrarMensaje("Ya estás unido a este partido.", "info", "global-mensaje");
    return;
  }
  if (partido.jugadores.length >= partido.cupos) {
    mostrarMensaje("El partido ya está lleno.", "error", "global-mensaje");
    return;
  }

  const nuevosJugadores = [...partido.jugadores, auth.currentUser.email];
  const docRef = doc(db, "partidos", id);

  updateDoc(docRef, { jugadores: nuevosJugadores }).then(() => {
    mostrarMensaje("Te has unido al partido exitosamente!", "exito", "global-mensaje");
    // Recargar ambas listas en la vista de partidos para que se actualicen
    cargarPartidos();
    cargarMisPartidos();
  }).catch(e => mostrarMensaje("Error al unirse al partido: " + e.message, "error", "global-mensaje"));
};

// Inicializar la aplicación: determina la página a mostrar al cargar
document.addEventListener('DOMContentLoaded', () => {
    // Adjuntar el listener para el botón de crear partido
    // Se hace aquí ya que el botón está presente en el DOM desde el inicio
    const btnCrear = document.getElementById("btnCrear");
    if (btnCrear) {
        btnCrear.addEventListener("click", crearPartido);
    }
    // Determinar la página inicial al cargar la SPA
    const initialPath = window.location.hash.substring(1) || 'cuenta';
    navigateTo(initialPath);
});