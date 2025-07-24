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
  getDoc,
  arrayUnion,
  arrayRemove,
  deleteDoc,
  serverTimestamp,
  onSnapshot
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
const equiposCol = collection(db, "equipos");
const invitacionesCol = collection(db, "invitaciones");

// --- Variables para SPA (GLOBALES) ---
const allSections = document.querySelectorAll('main section');
const navLinks = document.querySelectorAll('.nav-link');
const cuentaSection = document.getElementById('cuenta-section');
const notificationCountSpan = document.getElementById('notification-count');
let unsubscribeInvitationsListener = null; // Para gestionar el listener de notificaciones

console.log("APP: app.js cargado. Iniciando aplicación.");


// --- 1. FUNCIONES DE UTILIDAD BÁSICAS ---
function mostrarMensaje(mensaje, tipo = "exito", targetDivId = "global-mensaje") {
  const mensajeDiv = document.getElementById(targetDivId);
  if (mensajeDiv) {
    mensajeDiv.textContent = mensaje;
    mensajeDiv.className = `mensaje ${tipo}`;
    setTimeout(() => {
      mensajeDiv.textContent = "";
      mensajeDiv.className = "mensaje";
    }, 3000);
  } else {
    console.warn(`WARN: No se encontró el elemento con ID "${targetDivId}" para mostrar el mensaje: "${mensaje}"`);
  }
}

function hideAllSections() {
  allSections.forEach(section => {
    section.classList.add('hidden');
    section.classList.remove('active-section');
  });
}

function showSection(sectionId) {
  const sectionToShow = document.getElementById(sectionId);
  if (!sectionToShow) { // Comprobar existencia antes de manipular
    console.error("APP: showSection: Elemento con ID", sectionId, "no encontrado en el DOM.");
    return;
  }
  hideAllSections();
  sectionToShow.classList.remove('hidden');
  sectionToShow.classList.add('active-section');
  console.log("APP: Mostrando sección:", sectionId); // Depuración
}

// --- FUNCIÓN DE REINTENTO CON RETROCESO EXPONENCIAL (NUEVA) ---
async function retryOperation(operation, maxRetries = 5, baseDelayMs = 200) {
    for (let i = 0; i <= maxRetries; i++) {
        try {
            return await operation(); // Intenta ejecutar la operación
        } catch (error) {
            console.warn(`APP: Intento ${i + 1}/${maxRetries + 1} fallido:`, error.message, "Código:", error.code);
            // Solo reintentar para errores de permisos, cancelación o indisponibilidad (timing/network)
            if (error.code === 'permission-denied' || error.code === 'unavailable' || error.code === 'cancelled' || i === maxRetries) {
                if (i < maxRetries) {
                    const delay = baseDelayMs * Math.pow(2, i); // Retroceso exponencial
                    console.log(`APP: Reintentando en ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                } else {
                    console.error("APP: Máximo de reintentos alcanzado. Operación falló definitivamente.", error);
                    throw error; // Relanzar el error si se alcanzó el máximo de reintentos
                }
            } else {
                // Si es un tipo de error diferente, no reintentar, simplemente relanzar
                console.error("APP: Error no reintentable. Operación falló.", error);
                throw error;
            }
        }
    }
}


// --- Lógica de Navegación (SPA Router) ---
// MOVIDA AQUÍ ARRIBA PARA ASEGURAR QUE ESTÉ DEFINIDA ANTES DE CUALQUIER USO DIRECTO
function navigateTo(path) {
  const user = auth.currentUser;
  console.log("APP: navigateTo llamado con path:", path); // Depuración

  // Limpiar el estado del formulario "Crear Partido" al salir de él
  if (path === 'crear') {
    populateCrearPartidoSelects();
  } else {
    const lugarInput = document.getElementById('lugar');
    const fechaInput = document.getElementById('fecha');
    const tipoFutbolSelect = document.getElementById('tipoFutbol');
    const crearPartidoConEquipoSelect = document.getElementById('crearPartidoConEquipo');
    const mensajeCrear = document.getElementById('mensaje-crear');

    if (lugarInput) lugarInput.value = '';
    if (fechaInput) fechaInput.value = '';
    if (tipoFutbolSelect) tipoFutbolSelect.value = '';
    if (crearPartidoConEquipoSelect) crearPartidoConEquipoSelect.innerHTML = '<option value="">Selecciona tu equipo</option>';
    if (mensajeCrear) mensajeCrear.textContent = '';
  }


  // Bloquear acceso a secciones protegidas si no hay usuario
  if (['explorar', 'crear', 'partidos', 'notificaciones', 'torneo'].includes(path) && !user) {
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
    case 'notificaciones': // Nueva sección para notificaciones
      showSection('notificaciones-section');
      // El listener ya está configurado en onAuthStateChanged para actualizar
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


// --- Lógica de Autenticación para Cuenta (Con gestión de equipo) ---
function renderAuthForm(isLogin = false) {
  console.log("renderAuthForm: Se está ejecutando para isLogin =", isLogin); // Depuración
  // Asegurarse de que cuentaSection exista antes de usarlo
  if (!cuentaSection) {
      console.error("renderAuthForm: Elemento 'cuenta-section' no encontrado al intentar renderizar el formulario de autenticación.");
      mostrarMensaje("Error interno de la interfaz. Contacta al soporte.", "error", "global-mensaje");
      return;
  }

  const formId = isLogin ? 'login-form' : 'register-form';
  console.log("renderAuthForm: El ID del formulario será:", formId); // Depuración

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
  console.log("renderAuthForm: innerHTML de cuentaSection modificado."); // Depuración
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
      const nombreLower = nombre.toLowerCase();

      if (!nombre) {
        mostrarMensaje("Por favor, introduce tu nombre de jugador.", "error", "global-mensaje");
        return;
      }
      
      // VALIDACIÓN: Comprobar si el nombre ya existe para otro usuario
      const qNombreExistente = query(usuariosCol, where("nombre", "==", nombreLower));
      try {
        const snapshotNombreExistente = await getDocs(qNombreExistente);
        if (!snapshotNombreExistente.empty) {
            mostrarMensaje("Este nombre de jugador ya está en uso. Por favor, elige otro.", "error", "global-mensaje");
            return;
        }
      } catch (error) {
          console.error("FUNC: Error al verificar unicidad de nombre de jugador:", error);
          mostrarMensaje("Error al verificar nombre de jugador. Intenta de nuevo.", "error", "global-mensaje");
          return;
      }

      try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Guarda el nombre de jugador en el localStorage para que onAuthStateChanged lo use
        localStorage.setItem('temp_register_name', nombre);

        // ¡IMPORTANTE! La creación del documento de usuario en Firestore
        // ahora se espera que sea manejada por el listener onAuthStateChanged con reintentos.
        // No hay setDoc aquí en el frontend para evitar race conditions directas.

        mostrarMensaje("Cuenta creada correctamente. ¡Bienvenido, " + nombre + "!", "exito", "global-mensaje");
      } catch (error) {
        // Mejorar mensajes de error para el usuario
        let errorMessage = "Error al crear cuenta: ";
        if (error.code === 'auth/email-already-in-use') {
            errorMessage += "Este correo electrónico ya está registrado.";
        } else if (error.code === 'auth/invalid-email') {
            errorMessage += "El formato del correo electrónico es inválido.";
        } else if (error.code === 'auth/weak-password') {
            errorMessage += "La contraseña es demasiado débil (debe tener al menos 6 caracteres).";
        } else {
            errorMessage += error.message;
        }
        mostrarMensaje(errorMessage, "error", "global-mensaje");
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
        let errorMessage = "Error al iniciar sesión: ";
        if (error.code === 'auth/invalid-credential') { // Nuevo código para login fallido
            errorMessage += "Credenciales incorrectas. Verifica tu email y contraseña.";
        } else if (error.code === 'auth/user-not-found') {
            errorMessage += "Usuario no encontrado.";
        } else if (error.code === 'auth/wrong-password') {
            errorMessage += "Contraseña incorrecta.";
        } else {
            errorMessage += error.message;
        }
        mostrarMensaje(errorMessage, "error", "global-mensaje");
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
  let userDocData;

  if (user.uid) {
    const userDocRef = doc(db, "usuarios", user.uid);
    const userDocSnap = await getDoc(userDocRef);
    if (userDocSnap.exists()) {
      userDocData = userDocSnap.data();
      // Preferir nombreOriginal de Firestore si existe, si no, displayName de Auth, si no, email
      userName = userDocData.nombreOriginal || userDocData.nombre || user.email;
    }
  }
  if (!userName) { // Fallback si no hay displayName ni nombre en Firestore
    userName = user.email;
  }

  // Estructura base del perfil
  let profileHtml = `
    <h2>Mi perfil</h2>
    <p><strong>Email:</strong> ${user.email}</p>
    <p><strong>Nombre de Jugador:</strong> <span id="display-user-name">${userName}</span></p>
    <input type="text" id="edit-user-name" placeholder="Actualizar nombre" value="${userName}" style="display:none; margin-bottom: 10px;">
    <button id="btn-edit-name" style="margin-right: 10px;">Editar Nombre</button>
    <button id="btn-save-name" style="display:none; margin-right: 10px;">Guardar Nombre</button>
    <button id="cerrarSesion">Cerrar sesión</button>
    
    <div id="equipo-section-container" style="margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px;">
      <h3>Mi Equipo</h3>
      <div id="equipo-details"></div>
    </div>
  `;
  cuentaSection.innerHTML = profileHtml; // Renderiza la estructura base primero

  // Obtener referencias a los botones y elementos recién creados
  const btnEditName = document.getElementById('btn-edit-name');
  const btnSaveName = document.getElementById('btn-save-name');
  const editUserNameInput = document.getElementById('edit-user-name');
  const displayUserNameSpan = document.getElementById('display-user-name');
  const equipoDetailsDiv = document.getElementById('equipo-details');


  // --- Event Listeners para el perfil de usuario ---
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
    const newNameLower = newName.toLowerCase();
    if (newName && user) {
      const qNombreExistente = query(usuariosCol, where("nombre", "==", newNameLower));
      const snapshotNombreExistente = await getDocs(qNombreExistente);
      if (!snapshotNombreExistente.empty) {
          const foundDoc = snapshotNombreExistente.docs[0];
          if (foundDoc.id !== user.uid) {
              mostrarMensaje("Este nombre de jugador ya está en uso por otra persona. Por favor, elige otro.", "error", "global-mensaje");
              return;
          }
      }

      try {
        await updateProfile(user, { displayName: newName });
        await setDoc(doc(db, "usuarios", user.uid), { 
            nombre: newNameLower,
            nombreOriginal: newName
        }, { merge: true });
        
        if (userDocData && userDocData.esCapitan && userDocData.equipoCapitaneadoId) {
            const equipoRef = doc(db, "equipos", userDocData.equipoCapitaneadoId);
            const equipoSnap = await getDoc(equipoRef);
            if(equipoSnap.exists()){
                const equipoData = equipoSnap.data();
                const updatedJugadoresNombres = equipoData.jugadoresNombres.map(name => 
                    (name === userName ? newName : name) 
                );
                await updateDoc(equipoRef, {
                    capitanNombre: newName,
                    jugadoresNombres: updatedJugadoresNombres
                });
            }
        }

        mostrarMensaje("Nombre actualizado correctamente.", "exito", "global-mensaje");
        displayUserProfile(user); 
        if (window.location.hash.substring(1) === 'partidos') {
            cargarPartidos();
            cargarMisPartidos();
        }
      } catch (error) {
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

  // --- Lógica para mostrar la información del equipo (MODIFICADA para mostrar siempre Crear Equipo) ---
  let equipoHtmlContent = '';
  let isCaptainOfATeam = false; // Flag para saber si es capitán

  // 1. Obtener todos los equipos a los que pertenece el usuario (como jugador o capitán)
  const qAllUserTeams = query(equiposCol, where("jugadoresUids", "array-contains", user.uid));
  const allUserTeamsSnap = await getDocs(qAllUserTeams);
  
  let teamsWherePlayer = [];
  allUserTeamsSnap.forEach(doc => {
      teamsWherePlayer.push({ id: doc.id, data: doc.data() });
  });


  // 2. Mostrar Equipo Capitaneado (si aplica)
  if (userDocData && userDocData.esCapitan && userDocData.equipoCapitaneadoId) {
    const currentTeamId = userDocData.equipoCapitaneadoId;
    const equipoRef = doc(db, "equipos", currentTeamId);
    const equipoSnap = await getDoc(equipoRef);

    if (equipoSnap.exists()) {
      const equipoData = equipoSnap.data();
      isCaptainOfATeam = true;

      equipoHtmlContent += `
        <h4>Capitán de Equipo:</h4>
        <p>Eres Capitán del equipo <strong>${equipoData.nombre}</strong>.</p>
        <p><strong>Jugadores:</strong></p>
        <ul id="team-players-list">
          ${equipoData.jugadoresNombres.map(jugador => `<li>${jugador}</li>`).join('')}
        </ul>
        <input type="text" id="search-player-name" placeholder="Buscar jugador por nombre">
        <button id="btn-search-player">Buscar</button>
        <div id="player-search-results" style="margin-top: 10px;"></div>
        <button id="btn-delete-team" style="background-color: #dc3545;">Eliminar Equipo</button>
        <hr style="margin-top: 20px; margin-bottom: 20px; border-top: 1px dashed #ccc;">
      `;
    } else {
      await updateDoc(doc(db, "usuarios", user.uid), { esCapitan: false, equipoCapitaneadoId: null });
      equipoHtmlContent += `<p>Error: Tu equipo de capitán no se encontró. Hemos corregido tu estado de capitán.</p>`;
      isCaptainOfATeam = false; // Resetear flag
    }
  }

  // 3. Mostrar otros equipos donde es jugador (si aplica y no es el capitán del equipo ya mostrado)
  const otherTeamsWherePlayer = teamsWherePlayer.filter(team => 
      !(isCaptainOfATeam && team.id === userDocData.equipoCapitaneadoId) // Excluir el equipo capitaneado si ya se mostró
  );

  if (otherTeamsWherePlayer.length > 0) {
      equipoHtmlContent += `<h4>Jugador en otros Equipos:</h4><ul>`;
      otherTeamsWherePlayer.forEach(team => {
          equipoHtmlContent += `<li>${team.data.nombre}</li>`;
      });
      equipoHtmlContent += `</ul><hr style="margin-top: 20px; margin-bottom: 20px; border-top: 1px dashed #ccc;">`;
  }

  // 4. Opción de crear equipo (siempre visible ahora)
  equipoHtmlContent += `
      <h4>Crear Nuevo Equipo:</h4>
      <p>¡Crea tu propio equipo y conviértete en capitán!</p>
      <input type="text" id="new-team-name" placeholder="Nombre de tu nuevo equipo">
      <button id="btn-create-team">Crear Equipo</button>
  `;


  equipoDetailsDiv.innerHTML = equipoHtmlContent; // Asigna todo el HTML construido

  // --- Adjuntar todos los Event Listeners DESPUÉS de que el HTML esté en el DOM ---

  // Para la gestión de capitán/jugadores (si el usuario es capitán y la sección se renderizó)
  if (isCaptainOfATeam && userDocData && userDocData.equipoCapitaneadoId) {
      const currentTeamId = userDocData.equipoCapitaneadoId; 
      const btnSearchPlayer = document.getElementById('btn-search-player');
      const searchPlayerNameInput = document.getElementById('search-player-name');
      const btnDeleteTeam = document.getElementById('btn-delete-team');

      if (btnSearchPlayer) { 
          btnSearchPlayer.addEventListener('click', () => searchAndAddPlayer(currentTeamId));
      }
      if (searchPlayerNameInput) {
          searchPlayerNameInput.addEventListener('keypress', (e) => {
              if (e.key === 'Enter') {
                  e.preventDefault();
                  searchAndAddPlayer(currentTeamId);
              }
          });
      }
      if (btnDeleteTeam) {
          btnDeleteTeam.addEventListener('click', () => deleteTeam(currentTeamId, user.uid));
      }
  }

  // Para la creación de equipo (siempre visible ahora)
  const btnCreateTeam = document.getElementById('btn-create-team');
  if (btnCreateTeam) { // Comprobar si el elemento existe antes de añadir listener
      btnCreateTeam.addEventListener('click', createTeam);
  }
}
// --- Funciones de Gestión de Equipo ---

async function createTeam() {
    console.log("FUNC: createTeam llamado.");
    const user = auth.currentUser;
    if (!user) {
        mostrarMensaje("Debes iniciar sesión para crear un equipo.", "error", "global-mensaje");
        return;
    }
    const teamName = document.getElementById('new-team-name').value.trim();
    if (!teamName) {
        mostrarMensaje("Por favor, introduce un nombre para tu equipo.", "error", "global-mensaje");
        return;
    }

    // VALIDACIÓN: Comprobar si el nombre del equipo ya existe
    const qEquipoExistente = query(equiposCol, where("nombre", "==", teamName));
    try {
        const snapshotEquipoExistente = await getDocs(qEquipoExistente);
        if (!snapshotEquipoExistente.empty) {
            mostrarMensaje("Ya existe un equipo con este nombre. Por favor, elige otro.", "error", "global-mensaje");
            return;
        }
    } catch (error) {
        console.error("FUNC: Error al verificar unicidad de nombre de equipo:", error);
        mostrarMensaje("Error al verificar nombre de equipo. Intenta de nuevo.", "error", "global-mensaje");
        return;
    }


    const userDocRef = doc(db, "usuarios", user.uid);
    const userDocSnap = await getDoc(userDocRef);
    if (userDocSnap.exists() && userDocSnap.data().esCapitan) {
        mostrarMensaje("Ya eres capitán de un equipo. No puedes crear otro.", "error", "global-mensaje");
        return;
    }
    if (!user.displayName) {
        mostrarMensaje("Por favor, establece tu nombre de jugador en tu perfil antes de crear un equipo.", "error", "global-mensaje");
        return;
    }

    try {
        const newTeamRef = await addDoc(equiposCol, {
            nombre: teamName,
            capitanUid: user.uid,
            capitanEmail: user.email,
            capitanNombre: user.displayName,
            jugadoresUids: [user.uid],
            jugadoresNombres: [user.displayName]
        });
        console.log("FUNC: Documento de equipo creado en Firestore, ID:", newTeamRef.id);

        await updateDoc(userDocRef, {
            esCapitan: true,
            equipoCapitaneadoId: newTeamRef.id
        });
        console.log("FUNC: Documento de usuario actualizado como capitán.");

        mostrarMensaje(`Equipo "${teamName}" creado exitosamente!`, "exito", "global-mensaje");
        displayUserProfile(user); // Recargar la vista del perfil
    } catch (error) {
        console.error("FUNC: Error al crear equipo:", error);
        mostrarMensaje("Error al crear equipo: " + error.message, "error", "global-mensaje");
    }
}

async function searchAndAddPlayer(teamId) {
    console.log("FUNC: searchAndAddPlayer llamado para teamId:", teamId);
    const user = auth.currentUser;
    if (!user) {
        console.warn("FUNC: searchAndAddPlayer: Usuario no autenticado.");
        return;
    }

    if (!teamId) {
        console.error("FUNC: searchAndAddPlayer: teamId es undefined o nulo. No se puede realizar la búsqueda.");
        mostrarMensaje("Error interno: ID de equipo no disponible. Recarga la página o contacta soporte.", "error", "global-mensaje");
        return;
    }

    const searchPlayerNameInput = document.getElementById('search-player-name');
    const playerName = searchPlayerNameInput.value.trim();
    const playerNameLower = playerName.toLowerCase(); 
    const playerSearchResultsDiv = document.getElementById('player-search-results');
    playerSearchResultsDiv.innerHTML = ''; 

    if (!playerName) {
        mostrarMensaje("Por favor, introduce el nombre del jugador a buscar.", "error", "global-mensaje");
        return;
    }

    console.log(`FUNC: Buscando jugador con nombre (original): '${playerName}'`);
    console.log(`FUNC: Buscando jugador con nombre (minúsculas): '${playerNameLower}'`);

    try {
        const q = query(usuariosCol, where("nombre", "==", playerNameLower));
        const playerSnap = await getDocs(q);

        console.log("FUNC: Resultados de la consulta de jugadores (raw):", playerSnap.docs.map(doc => doc.data().nombreOriginal || doc.data().nombre));

        if (playerSnap.empty) {
            playerSearchResultsDiv.innerHTML = '<p>No se encontraron jugadores con ese nombre.</p>';
            console.log("FUNC: playerSnap está vacío: No se encontraron coincidencias.");
            return;
        }

        const teamRef = doc(db, "equipos", teamId);
        const teamSnap = await getDoc(teamRef);
        
        if (!teamSnap.exists()) {
            mostrarMensaje("Error: El equipo no fue encontrado. Asegúrate de que tu equipo exista.", "error", "global-mensaje");
            console.error("FUNC: searchAndAddPlayer: Equipo no encontrado para ID:", teamId);
            return;
        }
        const teamData = teamSnap.data();
        console.log("FUNC: Datos del equipo actual:", teamData);

        let foundPlayersCount = 0;
        playerSnap.forEach(playerDoc => {
            const playerData = playerDoc.data();
            const playerUid = playerDoc.id;
            const displayPlayerName = playerData.nombreOriginal || playerData.nombre; 

            console.log(`FUNC: Procesando jugador encontrado: ${displayPlayerName} (UID: ${playerUid})`);

            if (playerUid === user.uid) {
                playerSearchResultsDiv.innerHTML += `<p>${displayPlayerName} (${playerData.email}) - (Eres tú)</p>`;
                return;
            }
            if (teamData.jugadoresUids && teamData.jugadoresUids.includes(playerUid)) {
                playerSearchResultsDiv.innerHTML += `<p>${displayPlayerName} (${playerData.email}) - (Ya está en tu equipo)</p>`;
                return;
            }

            foundPlayersCount++;
            const resultDiv = document.createElement('div');
            resultDiv.style.marginBottom = '5px';
            
            // *** CAMBIO CRÍTICO AQUÍ: Generar invitacionId en el formato requerido por las reglas ***
            const invitacionIdForButton = playerUid + "_" + teamId;

            resultDiv.innerHTML = `
                <span>${displayPlayerName} (${playerData.email})</span>
                <button data-player-uid="${playerUid}" 
                        data-player-name="${displayPlayerName}" 
                        data-player-email="${playerData.email}"
                        data-invitacion-id-format="${invitacionIdForButton}"
                        style="margin-left: 10px; padding: 5px 10px; background-color: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer;">
                    Invitar
                </button>
            `;
            playerSearchResultsDiv.appendChild(resultDiv);
        });

        if (foundPlayersCount === 0 && playerSnap.size > 0) {
            playerSearchResultsDiv.innerHTML = '<p>Se encontraron coincidencias, pero ya están en tu equipo o eres tú.</p>';
        } else if (foundPlayersCount === 0 && playerSnap.size === 0) {
            // Este caso ya lo cubre el playerSnap.empty
        }

        playerSearchResultsDiv.querySelectorAll('button').forEach(button => {
            button.addEventListener('click', async (e) => {
                const targetButton = e.target;
                const playerUidToAdd = targetButton.dataset.playerUid;
                const playerNameToAdd = targetButton.dataset.playerName;
                const playerEmailToAdd = targetButton.dataset.playerEmail;
                // *** OBTENER EL ID DE INVITACIÓN EN EL FORMATO CORRECTO ***
                const invitacionDocId = targetButton.dataset.invitacionIdFormat; 

                // Verificación adicional: Si la invitación ya existe y está pendiente, no enviar de nuevo
                const existingInvitationRef = doc(invitacionesCol, invitacionDocId);
                const existingInvitationSnap = await getDoc(existingInvitationRef);
                if (existingInvitationSnap.exists() && existingInvitationSnap.data().estado === "pendiente") {
                    mostrarMensaje(`Ya existe una invitación pendiente para ${playerNameToAdd} en este equipo.`, "info", "global-mensaje");
                    return;
                }

                try {
                    // *** CAMBIO CRÍTICO AQUÍ: Usar setDoc con el ID predefinido ***
                    await setDoc(doc(invitacionesCol, invitacionDocId), {
                        equipoId: teamId,
                        equipoNombre: teamData.nombre,
                        capitanUid: user.uid,
                        capitanNombre: user.displayName || user.email,
                        invitadoUid: playerUidToAdd,
                        invitadoEmail: playerEmailToAdd,
                        estado: "pendiente",
                        timestamp: serverTimestamp()
                    });
                    console.log(`FUNC: Invitación enviada a ${playerNameToAdd}. ID de invitación: ${invitacionDocId}`);
                    mostrarMensaje(`Invitación enviada a ${playerNameToAdd}.`, "exito", "global-mensaje");
                    searchPlayerNameInput.value = '';
                    playerSearchResultsDiv.innerHTML = '';
                } catch (error) {
                    console.error(`FUNC: Error al enviar invitación a ${playerNameToAdd}:`, error);
                    mostrarMensaje(`Error al enviar invitación a ${playerNameToAdd}: ` + error.message, "error", "global-mensaje");
                }
            });
        });

    } catch (error) {
        console.error("FUNC: Error general al buscar jugador:", error);
        mostrarMensaje("Error al buscar jugador: " + error.message, "error", "global-mensaje");
    }
}

async function deleteTeam(teamId, captainUid) {
    console.log("FUNC: deleteTeam llamado para teamId:", teamId);
    const user = auth.currentUser;
    if (!user || user.uid !== captainUid) {
        mostrarMensaje("No tienes permiso para eliminar este equipo.", "error", "global-mensaje");
        return;
    }

    if (!confirm("¿Estás seguro de que quieres eliminar tu equipo? Esta acción es irreversible.")) {
        return;
    }
    try {
        const teamRef = doc(db, "equipos", teamId);
        const teamSnap = await getDoc(teamRef);
        if (!teamSnap.exists() || teamSnap.data().capitanUid !== user.uid) {
            mostrarMensaje("No tienes permiso para eliminar este equipo.", "error", "global-mensaje");
            return;
        }

        await updateDoc(doc(db, "usuarios", user.uid), {
            esCapitan: false,
            equipoCapitaneadoId: null
        });
        console.log("FUNC: Usuario desvinculado de capitán.");

        await deleteDoc(teamRef);
        console.log("FUNC: Documento de equipo eliminado.");

        mostrarMensaje("Equipo eliminado exitosamente.", "exito", "global-mensaje");
        displayUserProfile(user); // Recargar la vista del perfil
    } catch (error) {
        console.error("FUNC: Error al eliminar equipo:", error);
        mostrarMensaje("Error al eliminar equipo: " + error.message, "error", "global-mensaje");
    }
}

// Funciones de gestión de invitaciones
async function setupInvitationsListener(userUid) {
    console.log("FUNC: setupInvitationsListener llamado para UID:", userUid);
    const invitacionesListDiv = document.getElementById('invitaciones-list');
    
    if (unsubscribeInvitationsListener) {
        unsubscribeInvitationsListener();
        console.log("FUNC: Listener de invitaciones anterior desuscrito.");
    }

    if (!invitacionesListDiv) {
        console.warn("FUNC: Elemento 'invitaciones-list' no encontrado. No se configurará el listener de invitaciones.");
        return;
    }

    const q = query(
        invitacionesCol,
        where("invitadoUid", "==", userUid),
        where("estado", "==", "pendiente"),
        // orderBy("timestamp", "desc") // Requiere índice compuesto en Firestore si hay más de 1 campo en where.
    );

    unsubscribeInvitationsListener = onSnapshot(q, (snapshot) => {
        console.log("FUNC: onSnapshot de invitaciones disparado. Cambios detectados:", snapshot.docChanges().length);
        let invitacionesPendientesCount = 0;
        let html = '';
        if (snapshot.empty) {
            html = '<p>No tienes invitaciones pendientes.</p>';
            console.log("FUNC: No hay invitaciones pendientes.");
        } else {
            snapshot.forEach(doc => {
                invitacionesPendientesCount++;
                const invitacion = doc.data();
                const invitacionId = doc.id;
                html += `
                    <div class="invitacion-card" style="border: 1px solid #ccc; padding: 15px; margin-bottom: 10px; border-radius: 8px;">
                        <p>Te han invitado a unirte al equipo <strong>${invitacion.equipoNombre}</strong> (Capitán: ${invitacion.capitanNombre}).</p>
                        <button class="btn-aceptar-invitacion" data-invitacion-id="${invitacionId}" data-equipo-id="${invitacion.equipoId}" data-equipo-nombre="${invitacion.equipoNombre}">Aceptar</button>
                        <button class="btn-rechazar-invitacion" data-invitacion-id="${invitacionId}">Rechazar</button>
                    </div>
                `;
            });
            console.log("FUNC: Invitaciones pendientes cargadas:", invitacionesPendientesCount);
        }
        invitacionesListDiv.innerHTML = html;

        if (notificationCountSpan) {
            if (invitacionesPendientesCount > 0) {
                notificationCountSpan.textContent = invitacionesPendientesCount;
                notificationCountSpan.style.display = 'inline-block';
            } else {
                notificationCountSpan.textContent = '';
                notificationCountSpan.style.display = 'none';
            }
        }
        
        invitacionesListDiv.querySelectorAll('.btn-aceptar-invitacion').forEach(button => {
            button.addEventListener('click', aceptarInvitacion);
        });
        invitacionesListDiv.querySelectorAll('.btn-rechazar-invitacion').forEach(button => {
            button.addEventListener('click', rechazarInvitacion);
        });
    }, (error) => {
        console.error("FUNC: Error al escuchar invitaciones:", error);
        mostrarMensaje("Error al cargar invitaciones.", "error", "notificaciones-list");
    });
}

async function aceptarInvitacion(event) {
    console.log("FUNC: aceptarInvitacion llamado.");
    const invitacionId = event.target.dataset.invitacionId;
    const equipoId = event.target.dataset.equipoId;
    const equipoNombre = event.target.dataset.equipoNombre;
    const user = auth.currentUser;

    if (!user) {
        mostrarMensaje("Debes iniciar sesión para aceptar invitaciones.", "error", "global-mensaje");
        return;
    }

    try {
        const invitacionRef = doc(db, "invitaciones", invitacionId);
        const invitacionSnap = await getDoc(invitacionRef);
        if (!invitacionSnap.exists() || invitacionSnap.data().estado !== "pendiente") {
            mostrarMensaje("La invitación ya no es válida o fue procesada.", "info", "global-mensaje");
            // Forzar actualización del listener
            if (user && user.uid) setupInvitationsListener(user.uid);
            return;
        }

        const userDocRef = doc(db, "usuarios", user.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (!userDocSnap.exists()) {
            mostrarMensaje("Error: Tu perfil de usuario no se encontró. No puedes unirte a un equipo sin perfil.", "error", "global-mensaje");
            console.error("FUNC: Usuario intentó aceptar invitación pero no tiene documento de perfil en Firestore.");
            return;
        }
        const userData = userDocSnap.data();
        const userNameOriginal = userData.nombreOriginal || userData.nombre || user.email;

        // Actualizar estado de la invitación a 'aceptada'
        await updateDoc(invitacionRef, { estado: "aceptada" });
        console.log("FUNC: Estado de invitación actualizado a 'aceptada'.");

        // Añadir jugador al equipo
        // Añadir jugador al equipo (reemplazando arrayUnion para cumplir reglas Firestore)
        const equipoRef = doc(db, "equipos", equipoId);
        const equipoSnap = await getDoc(equipoRef);
        if (!equipoSnap.exists()) {
            mostrarMensaje("El equipo ya no existe.", "error", "global-mensaje");
            return;
        }
        const equipoData = equipoSnap.data();

        await updateDoc(equipoRef, {
          jugadoresUids: [...equipoData.jugadoresUids, user.uid],
          jugadoresNombres: [...equipoData.jugadoresNombres, userNameOriginal]
        });

        console.log("FUNC: Jugador añadido al equipo.");

        mostrarMensaje(`¡Has aceptado la invitación y te has unido a ${equipoNombre}!`, "exito", "global-mensaje");
        // No es necesario recargar displayUserProfile aquí, el listener de invitaciones se encargará.
    } catch (error) {
        console.error("FUNC: Error al aceptar invitación:", error);
        mostrarMensaje("Error al aceptar invitación: " + error.message, "error", "global-mensaje");
    }
}

async function rechazarInvitacion(event) {
    console.log("FUNC: rechazarInvitacion llamado.");
    const invitacionId = event.target.dataset.invitacionId;
    const user = auth.currentUser;

    if (!user) {
        mostrarMensaje("Debes iniciar sesión para rechazar invitaciones.", "error", "global-mensaje");
        return;
    }

    try {
        const invitacionRef = doc(db, "invitaciones", invitacionId);
        const invitacionSnap = await getDoc(invitacionRef);
        if (!invitacionSnap.exists() || invitacionSnap.data().estado !== "pendiente") {
            mostrarMensaje("La invitación ya no es válida o fue procesada.", "info", "global-mensaje");
            // Forzar actualización del listener
            if (user && user.uid) setupInvitationsListener(user.uid);
            return;
        }

        await updateDoc(invitacionRef, { estado: "rechazada" });
        console.log("FUNC: Invitación rechazada.");
        mostrarMensaje("Has rechazado la invitación.", "info", "global-mensaje");
    } catch (error) {
        console.error("FUNC: Error al rechazar invitación: " + error.message, "error", "global-mensaje");
        mostrarMensaje("Error al rechazar invitación: " + error.message, "error", "global-mensaje");
    }
}


// --- Funciones de Partidos ---

// Rellena el select de "Crear partido con mi equipo"
async function populateCrearPartidoSelects() {
    console.log("FUNC: populateCrearPartidoSelects llamado."); // Depuración
    const crearPartidoConEquipoSelect = document.getElementById('crearPartidoConEquipo');
    if (!crearPartidoConEquipoSelect) {
        console.warn("FUNC: Elemento 'crearPartidoConEquipo' no encontrado.");
        return;
    }

    crearPartidoConEquipoSelect.innerHTML = '<option value="">Selecciona tu equipo</option>';

    try {
        const user = auth.currentUser;
        if (!user) {
            crearPartidoConEquipoSelect.innerHTML = '<option value="">Inicia sesión para ver equipos</option>';
            console.log("FUNC: No hay usuario para cargar equipos en populateCrearPartidoSelects.");
            return;
        }

        const qJugadorEnEquipos = query(equiposCol, where("jugadoresUids", "array-contains", user.uid));
        const jugadorEquiposSnap = await getDocs(qJugadorEnEquipos);
        
        let misEquiposDisponibles = [];
        jugadorEquiposSnap.forEach(doc => {
            misEquiposDisponibles.push({ id: doc.id, nombre: doc.data().nombre });
        });

        if (misEquiposDisponibles.length === 0) {
            crearPartidoConEquipoSelect.innerHTML = '<option value="">No estás en ningún equipo</option>';
            console.log("FUNC: Usuario no está en ningún equipo para crear partido."); // Depuración
        } else {
            for (const equipo of misEquiposDisponibles) {
                const option = document.createElement('option');
                option.value = equipo.id;
                option.textContent = equipo.nombre;
                crearPartidoConEquipoSelect.appendChild(option);
            }
            console.log("FUNC: Equipos cargados para crear partido."); // Depuración
        }

    } catch (error) {
        console.error("FUNC: Error al cargar selects de creación de partido:", error);
        mostrarMensaje("Error al cargar opciones de equipos: " + error.message, "error", "global-mensaje");
    }
}


// Carga los partidos disponibles
async function cargarPartidos() {
  console.log("FUNC: cargarPartidos llamado."); // Depuración
  const lista = document.getElementById("lista-partidos");
  if (!lista) {
      console.warn("FUNC: Elemento 'lista-partidos' no encontrado.");
      return;
  }
  lista.innerHTML = "";

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  try {
    const snapshot = await getDocs(partidosCol);
    if (snapshot.empty) {
      lista.innerHTML = "<p>No hay partidos disponibles en este momento.</p>";
      console.log("FUNC: No hay partidos disponibles."); // Depuración
      return;
    }
    console.log("FUNC: Partidos cargados:", snapshot.docs.length); // Depuración
    for (const docSnapshot of snapshot.docs) {
      const p = docSnapshot.data();
      const partidoId = docSnapshot.id;

      const fechaPartido = new Date(p.fecha);
      if (fechaPartido < hoy) continue;

      const equipo1Nombre = await getTeamNameById(p.equipo1Id);
      const equipo2Nombre = p.equipo2Id ? await getTeamNameById(p.equipo2Id) : "Vacante";

      const div = document.createElement("div");
      div.className = "partido";
      const fechaFormateada = fechaPartido.toLocaleString();
      
      // Obtener jugadores confirmados y reserva para Equipo 1
      const jugadoresConfirmados1 = p.jugadoresEquipo1Nombres || [];
      const jugadoresReserva1 = p.jugadoresEquipo1ReservaNombres || [];

      // Obtener jugadores confirmados y reserva para Equipo 2
      const jugadoresConfirmados2 = p.jugadoresEquipo2Nombres || [];
      const jugadoresReserva2 = p.jugadoresEquipo2ReservaNombres || [];


      div.innerHTML = `
        <h3>${p.lugar}</h3>
        <p class="fecha-partido"><strong>Fecha:</strong> ${fechaFormateada}</p>
        <p><strong>Tipo:</strong> ${p.tipoFutbol} (${p.cupos} jugadores por equipo)</p>
        <p><strong>Equipos:</strong> ${equipo1Nombre} vs ${equipo2Nombre}</p>
        
        <h4 style="margin-top: 10px; margin-bottom: 5px;">Jugadores:</h4>
        <div class="team-players-summary" style="display: flex; gap: 20px; flex-wrap: wrap;">
            <div style="flex: 1; min-width: 150px;">
                <strong>${equipo1Nombre}:</strong><br>
                ${jugadoresConfirmados1.length > 0 ? `Titulares (${jugadoresConfirmados1.length}): ${jugadoresConfirmados1.join(', ')}` : 'Sin titulares'}
                ${jugadoresReserva1.length > 0 ? `<br>Reserva (${jugadoresReserva1.length}): ${jugadoresReserva1.join(', ')}` : ''}
            </div>
            ${p.equipo2Id ? `
            <div style="flex: 1; min-width: 150px;">
                <strong>${equipo2Nombre}:</strong><br>
                ${jugadoresConfirmados2.length > 0 ? `Titulares (${jugadoresConfirmados2.length}): ${jugadoresConfirmados2.join(', ')}` : 'Sin titulares'}
                ${jugadoresReserva2.length > 0 ? `<br>Reserva (${jugadoresReserva2.length}): ${jugadoresReserva2.join(', ')}` : ''}
            </div>
            ` : ''}
        </div>
      `;

      if (auth.currentUser) {
        const userDocRef = doc(db, "usuarios", auth.currentUser.uid);
        const userDocSnap = await getDoc(userDocRef);
        const userDocData = userDocSnap.data();

        let currentUserTeamsIds = [];
        const qUserTeams = query(equiposCol, where("jugadoresUids", "array-contains", auth.currentUser.uid));
        const userTeamsSnap = await getDocs(qUserTeams);
        userTeamsSnap.forEach(teamDoc => currentUserTeamsIds.push(teamDoc.id));

        const isUserInEquipo1 = currentUserTeamsIds.includes(p.equipo1Id);
        const isUserInEquipo2 = p.equipo2Id && currentUserTeamsIds.includes(p.equipo2Id);

        if (userDocData && userDocData.esCapitan && userDocData.equipoCapitaneadoId) {
            const miEquipoId = userDocData.equipoCapitaneadoId;

            if (p.equipo1Id === miEquipoId) {
                div.innerHTML += `<span style="color: blue;">(Tu equipo lo creó)</span>`;
            } 
            else if (p.equipo2Id === miEquipoId) {
                div.innerHTML += `<span style="color: green;">(Tu equipo ya está inscrito)</span>`;
            }
            else if (!p.equipo2Id) {
                const btn = document.createElement("button");
                btn.textContent = "Unirse (como Equipo 2)";
                btn.onclick = () => unirseAPartido(partidoId, p, miEquipoId, userDocData.nombreOriginal); 
                div.appendChild(btn);
            } else {
                div.innerHTML += `<span style="color: orange;">(Partido con dos equipos)</span>`;
            }
        } else {
            if (isUserInEquipo1 || isUserInEquipo2) {
                div.innerHTML += `<span style="color: purple;">(Tu equipo participa en este partido)</span>`;
            } else {
                div.innerHTML += `<span style="color: gray;">(Debes ser capitán de un equipo para unirte como Equipo 2)</span>`;
            }
        }
      }
      lista.appendChild(div);
    }
  } catch (e) {
    console.error("FUNC: Error al cargar partidos:", e);
    mostrarMensaje("Error al cargar partidos: " + e.message, "error", "global-mensaje");
  }
}

// Función para crear partido
async function crearPartido() {
  console.log("FUNC: crearPartido llamado."); // Depuración
  const crearPartidoConEquipoId = document.getElementById('crearPartidoConEquipo').value;
  const lugarInput = document.getElementById("lugar");
  const lugar = lugarInput.value.trim();
  const fechaInput = document.getElementById("fecha").value;
  const tipoFutbol = document.getElementById('tipoFutbol').value;
  const currentUser = auth.currentUser;

  if (!crearPartidoConEquipoId || !lugar || !fechaInput || !tipoFutbol) {
    mostrarMensaje("Por favor, completa todos los campos obligatorios.", "error", "mensaje-crear");
    return;
  }
  if (!currentUser) {
      mostrarMensaje("Debes iniciar sesión para crear un partido.", "error", "mensaje-crear");
      return;
  }

  // --- Obtener datos del equipo con el que se crea el partido ---
  const equipoCreadorRef = doc(db, "equipos", crearPartidoConEquipoId);
  const equipoCreadorSnap = await getDoc(equipoCreadorRef);
  if (!equipoCreadorSnap.exists()) {
      mostrarMensaje("Error: El equipo seleccionado para crear el partido no es válido.", "error", "mensaje-crear");
      console.error("FUNC: Equipo creador no encontrado para ID:", crearPartidoConEquipoId); // Depuración
      return;
  }
  const equipoCreadorData = equipoCreadorSnap.data();

  // Validar que el usuario actual sea parte del equipo seleccionado
  if (!equipoCreadorData.jugadoresUids.includes(currentUser.uid)) {
      mostrarMensaje("No eres parte del equipo seleccionado para crear el partido.", "error", "mensaje-crear");
      return;
  }

  // Obtener cupos basados en el tipo de fútbol
  let cuposPorEquipo = 0;
  switch(tipoFutbol) {
      case "Futbol 5": cuposPorEquipo = 5; break;
      case "Futbol 7": cuposPorEquipo = 7; break;
      default:
          mostrarMensaje("Tipo de fútbol no válido.", "error", "mensaje-crear");
          return;
  }


  // --- Validación de Fecha ---
  const fechaSeleccionada = new Date(fechaInput);
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0); 
  fechaSeleccionada.setHours(0, 0, 0, 0); 

  if (fechaSeleccionada < hoy) {
    mostrarMensaje("No puedes crear partidos en fechas pasadas.", "error", "mensaje-crear");
    return;
  }

  const maxFecha = new Date();
  maxFecha.setDate(hoy.getDate() + 30);
  maxFecha.setHours(23, 59, 59, 999);

  if (fechaSeleccionada > maxFecha) {
    mostrarMensaje("No puedes crear partidos con más de 30 días de anticipación.", "error", "mensaje-crear");
    return;
  }
  
  const partido = {
    lugar: lugar,
    fecha: fechaInput,
    tipoFutbol: tipoFutbol,
    cupos: cuposPorEquipo, // Cantidad de jugadores titulares por equipo
    creadorUid: currentUser.uid,
    creadorEmail: currentUser.email,
    equipo1Id: crearPartidoConEquipoId,
    cambiosPorEquipo: tipoFutbol === "Futbol 5" ? 2 : 2, // 2 cambios permitidos para Futbol 5 y Futbol 7
    equipo1Nombre: equipoCreadorData.nombre,
    equipo2Id: null,
    equipo2Nombre: null,
    // --- NUEVOS CAMPOS: Jugadores y Reservas para Equipo 1 al crear el partido ---
    jugadoresEquipo1Uids: [],
    jugadoresEquipo1Nombres: [],
    jugadoresEquipo1ReservaUids: [],
    jugadoresEquipo1ReservaNombres: [],
    // Inicialmente vacíos para Equipo 2
    jugadoresEquipo2Uids: [], 
    jugadoresEquipo2Nombres: [],
    jugadoresEquipo2ReservaUids: [],
    jugadoresEquipo2ReservaNombres: []
  };

  // --- Llenar jugadores del Equipo 1 al crear el partido ---
  // Obtener la instantánea actual de los jugadores del equipo creador
  const jugadoresEquipoCreadorUids = equipoCreadorData.jugadoresUids || [];
  const jugadoresEquipoCreadorNombres = equipoCreadorData.jugadoresNombres || [];

  const maxJugadoresConfirmados = cuposPorEquipo; // 5 o 7
  const maxJugadoresConReserva = cuposPorEquipo + partido.cambiosPorEquipo; // 5+2=7 o 7+2=9

  let jugadoresConfirmadosEquipo1 = [];
  let jugadoresReservaEquipo1 = [];

  for (let i = 0; i < jugadoresEquipoCreadorUids.length; i++) {
      if (i < maxJugadoresConfirmados) {
          jugadoresConfirmadosEquipo1.push({ uid: jugadoresEquipoCreadorUids[i], nombre: jugadoresEquipoCreadorNombres[i] });
      } else if (jugadoresReservaEquipo1.length < (maxJugadoresConReserva - maxJugadoresConfirmados)) {
          jugadoresReservaEquipo1.push({ uid: jugadoresEquipoCreadorUids[i], nombre: jugadoresEquipoCreadorNombres[i] });
      } else {
          // Si hay más jugadores de los permitidos en total (confirmados + reserva), no los añade.
          break; 
      }
  }

  // Validar mínimo de jugadores al crear el partido
  if (jugadoresConfirmadosEquipo1.length < maxJugadoresConfirmados) {
    mostrarMensaje(`Tu equipo (${equipoCreadorData.nombre}) tiene ${jugadoresConfirmadosEquipo1.length} jugadores. Necesita al menos ${maxJugadoresConfirmados} para crear este partido de ${tipoFutbol}.`, "error", "mensaje-crear");
    return;
  }

  // Asignar los jugadores confirmados y reserva al objeto partido
  partido.jugadoresEquipo1Uids = jugadoresConfirmadosEquipo1.map(j => j.uid);
  partido.jugadoresEquipo1Nombres = jugadoresConfirmadosEquipo1.map(j => j.nombre);
  partido.jugadoresEquipo1ReservaUids = jugadoresReservaEquipo1.map(j => j.uid);
  partido.jugadoresEquipo1ReservaNombres = jugadoresReservaEquipo1.map(j => j.nombre);


  addDoc(partidosCol, partido).then(() => {
    mostrarMensaje("¡Partido creado exitosamente!", "exito", "global-mensaje");
    // Limpiar el formulario
    document.getElementById('crearPartidoConEquipo').value = '';
    document.getElementById("lugar").value = '';
    document.getElementById("fecha").value = '';
    document.getElementById('tipoFutbol').value = '';
    navigateTo('partidos');
  }).catch(e => {
    console.error("FUNC: Error al crear partido:", e); // Depuración
    mostrarMensaje("Error al crear partido: " + e.message, "error", "mensaje-crear");
  });
}

// Carga los partidos donde el usuario es parte de alguno de los equipos
async function cargarMisPartidos() {
  console.log("FUNC: cargarMisPartidos llamado."); // Depuración
  const cont = document.getElementById("mis-partidos");
  if (!cont) {
      console.warn("FUNC: Elemento 'mis-partidos' no encontrado.");
      return;
  }
  cont.innerHTML = "";
  const currentUser = auth.currentUser;
  if (!currentUser) {
      cont.innerHTML = "<p>Inicia sesión para ver tus partidos.</p>";
      return;
  }

  try {
    const userDocRef = doc(db, "usuarios", currentUser.uid);
    const userDocSnap = await getDoc(userDocRef);
    if (!userDocSnap.exists()) {
        cont.innerHTML = "<p>Tu perfil de usuario no se encontró. Por favor, contacta a soporte.</p>";
        console.warn("FUNC: Perfil de usuario no encontrado en Firestore para cargar mis partidos."); // Depuración
        return;
    }
    
    let misEquiposIds = [];
    const qJugadorEnEquipos = query(equiposCol, where("jugadoresUids", "array-contains", currentUser.uid));
    const jugadorEquiposSnap = await getDocs(qJugadorEnEquipos);
    jugadorEquiposSnap.forEach(doc => {
        misEquiposIds.push(doc.id);
    });

    if (misEquiposIds.length === 0) {
        cont.innerHTML = "<p>No estás inscrito en ningún equipo. ¡Crea o únete a uno para ver tus partidos!</p>";
        console.log("FUNC: Usuario no está en ningún equipo para ver mis partidos."); // Depuración
        return;
    }
    console.log("FUNC: Equipos del usuario encontrados para mis partidos:", misEquiposIds); // Depuración

    const qPartidosEquipo1 = query(partidosCol, where("equipo1Id", "in", misEquiposIds));
    const snapshotEquipo1 = await getDocs(qPartidosEquipo1);

    const qPartidosEquipo2 = query(partidosCol, where("equipo2Id", "in", misEquiposIds));
    const snapshotEquipo2 = await getDocs(qPartidosEquipo2);

    const allMyMatches = new Map();
    snapshotEquipo1.forEach(doc => allMyMatches.set(doc.id, { id: doc.id, data: doc.data() }));
    snapshotEquipo2.forEach(doc => allMyMatches.set(doc.id, { id: doc.id, data: doc.data() }));

    console.log("FUNC: Total de mis partidos cargados:", allMyMatches.size); // Depuración

    if (allMyMatches.size === 0) {
      cont.innerHTML = "<p>Aún no has creado ni te has unido a ningún partido con tu(s) equipo(s).</p>";
      return;
    }
    
    for (const [partidoId, docObj] of allMyMatches.entries()) {
      const p = docObj.data;
      const div = document.createElement("div");
      const fechaFormateada = new Date(p.fecha).toLocaleString();
      
      const equipo1Nombre = await getTeamNameById(p.equipo1Id);
      const equipo2Nombre = p.equipo2Id ? await getTeamNameById(p.equipo2Id) : "Vacante";

      let estado = "";
      if (misEquiposIds.includes(p.equipo1Id) && misEquiposIds.includes(p.equipo2Id)) {
        estado = "(Tu(s) equipo(s) juegan este partido)"; 
      } else if (misEquiposIds.includes(p.equipo1Id)) {
          estado = "(Tu equipo es Equipo 1)";
      } else if (misEquiposIds.includes(p.equipo2Id)) {
          estado = "(Tu equipo es Equipo 2)";
      }

      // Obtener jugadores confirmados y reserva para Equipo 1
      const jugadoresConfirmados1 = p.jugadoresEquipo1Nombres || [];
      const jugadoresReserva1 = p.jugadoresEquipo1ReservaNombres || [];

      // Obtener jugadores confirmados y reserva para Equipo 2
      const jugadoresConfirmados2 = p.jugadoresEquipo2Nombres || [];
      const jugadoresReserva2 = p.jugadoresEquipo2ReservaNombres || [];

      div.className = "partido";
      div.innerHTML = `
        <h3>${p.lugar}</h3>
        <p class="fecha-partido"><strong>Fecha:</strong> ${fechaFormateada}</p>
        <p><strong>Tipo:</strong> ${p.tipoFutbol} (${p.cupos} jugadores por equipo)</p>
        <p><strong>Equipos:</strong> ${equipo1Nombre} vs ${equipo2Nombre} ${estado}</p>
        
        <h4 style="margin-top: 10px; margin-bottom: 5px;">Jugadores:</h4>
        <div class="team-players-summary" style="display: flex; gap: 20px; flex-wrap: wrap;">
            <div style="flex: 1; min-width: 150px;">
                <strong>${equipo1Nombre}:</strong><br>
                ${jugadoresConfirmados1.length > 0 ? `Titulares (${jugadoresConfirmados1.length}): ${jugadoresConfirmados1.join(', ')}` : 'Sin titulares'}
                ${jugadoresReserva1.length > 0 ? `<br>Reserva (${jugadoresReserva1.length}): ${jugadoresReserva1.join(', ')}` : ''}
            </div>
            ${p.equipo2Id ? `
            <div style="flex: 1; min-width: 150px;">
                <strong>${equipo2Nombre}:</strong><br>
                ${jugadoresConfirmados2.length > 0 ? `Titulares (${jugadoresConfirmados2.length}): ${jugadoresConfirmados2.join(', ')}` : 'Sin titulares'}
                ${jugadoresReserva2.length > 0 ? `<br>Reserva (${jugadoresReserva2.length}): ${jugadoresReserva2.join(', ')}` : ''}
            </div>
            ` : ''}
        </div>
      `;
      cont.appendChild(div);
    }
  } catch (e) {
    console.error("FUNC: Error al cargar mis partidos:", e);
    mostrarMensaje("Error al cargar mis partidos: " + e.message, "error", "global-mensaje");
  }
}

// Unirse a un partido como Equipo 2 (Solo capitanes de un equipo que no sea el equipo1)
window.unirseAPartido = async function(partidoId, partidoData, miEquipoId, miEquipoNombre) {
  console.log("FUNC: unirseAPartido llamado."); // Depuración
  const currentUser = auth.currentUser;
  if (!currentUser) {
    mostrarMensaje("Debes iniciar sesión para unirte a un partido.", "error", "global-mensaje");
    navigateTo('cuenta');
    return;
  }

  // Verificar que el usuario que se une sea capitán y tenga el equipo correcto
  const userDocRef = doc(db, "usuarios", currentUser.uid);
  const userDocSnap = await getDoc(userDocRef);
  if (!userDocSnap.exists()) {
      mostrarMensaje("Error: Tu perfil de usuario no se encontró.", "error", "global-mensaje");
      console.error("FUNC: Perfil de usuario no encontrado para unirse a partido.");
      return;
  }
  if (!userDocSnap.data().esCapitan || userDocSnap.data().equipoCapitaneadoId !== miEquipoId) {
      mostrarMensaje("Solo los capitanes pueden unir su equipo a un partido.", "error", "global-mensaje");
      console.warn("FUNC: Intento de unirse a partido sin ser el capitán correcto."); // Depuración
      return;
  }

  // Verificar que el partido no tenga ya un Equipo 2
  if (partidoData.equipo2Id) {
    mostrarMensaje("Este partido ya tiene un equipo rival.", "info", "global-mensaje");
    cargarPartidos(); // Refrescar por si la data local está desactualizada
    return;
  }

  // Verificar que no intente unirse a su propio partido
  if (partidoData.equipo1Id === miEquipoId) {
      mostrarMensaje("No puedes unirte a tu propio partido como rival.", "info", "global-mensaje");
      return;
  }

  const partidoRef = doc(db, "partidos", partidoId);

  // --- OBTENER JUGADORES DEL EQUIPO QUE SE UNE ---
  const equipoQueSeUneRef = doc(db, "equipos", miEquipoId);
  const equipoQueSeUneSnap = await getDoc(equipoQueSeUneRef);
  if (!equipoQueSeUneSnap.exists()) {
      mostrarMensaje("Error: Tu equipo no se encontró. No puedes unirte al partido.", "error", "global-mensaje");
      console.error("FUNC: Equipo que se une no encontrado para ID:", miEquipoId); // Depuración
      return;
  }
  const equipoQueSeUneData = equipoQueSeUneSnap.data();
  const jugadoresEquipoQueSeUneUids = equipoQueSeUneData.jugadoresUids || [];
  const jugadoresEquipoQueSeUneNombres = equipoQueSeUneData.jugadoresNombres || [];

  const maxJugadoresConfirmados = partidoData.cupos; // 5 o 7
  const maxJugadoresConReserva = partidoData.cupos + partidoData.cambiosPorEquipo; // 5+2 o 7+2


  // --- VALIDACIÓN Y ASIGNACIÓN A RESERVA ---
  if (jugadoresEquipoQueSeUneUids.length < maxJugadoresConfirmados) {
      mostrarMensaje(`Tu equipo tiene ${jugadoresEquipoQueSeUneUids.length} jugadores. Necesita al menos ${maxJugadoresConfirmados} para este partido de ${partidoData.tipoFutbol}.`, "error", "global-mensaje");
      return;
  }
  
  let jugadoresConfirmados = [];
  let jugadoresReserva = [];

  // Los primeros N jugadores son confirmados, el resto son reserva
  for (let i = 0; i < jugadoresEquipoQueSeUneUids.length; i++) {
      if (i < maxJugadoresConfirmados) {
          jugadoresConfirmados.push({ uid: jugadoresEquipoQueSeUneUids[i], nombre: jugadoresEquipoQueSeUneNombres[i] });
      } else if (jugadoresReserva.length < (maxJugadoresConReserva - maxJugadoresConfirmados)) {
          jugadoresReserva.push({ uid: jugadoresEquipoQueSeUneUids[i], nombre: jugadoresEquipoQueSeUneNombres[i] });
      } else {
          // Si hay más jugadores de los permitidos en total (confirmados + reserva), no los añade.
          break; 
      }
  }


  try {
    await updateDoc(partidoRef, {
      equipo2Id: miEquipoId,
      equipo2Nombre: miEquipoNombre,
      jugadoresEquipo2Uids: jugadoresConfirmados.map(j => j.uid),
      jugadoresEquipo2Nombres: jugadoresConfirmados.map(j => j.nombre),
      jugadoresEquipo2ReservaUids: jugadoresReserva.map(j => j.uid),
      jugadoresEquipo2ReservaNombres: jugadoresReserva.map(j => j.nombre)
    });
    console.log("FUNC: Equipo unido al partido exitosamente."); // Depuración
    mostrarMensaje("Tu equipo se ha unido al partido exitosamente!", "exito", "global-mensaje");
    cargarPartidos(); // Refrescar ambos listados
    cargarMisPartidos();
  } catch (e) {
    console.error("FUNC: Error al unirse al partido:", e); // Depuración
    mostrarMensaje("Error al unirse al partido: " + e.message, "error", "global-mensaje");
  }
};


// Listener para onAuthStateChanged: Maneja cambios de estado de autenticación
onAuthStateChanged(auth, async user => {
  if (user) {
    console.log("APP: onAuthStateChanged: Usuario autenticado. UID:", user.uid); // Depuración
    const userDocRef = doc(db, "usuarios", user.uid);
    let userDocSnap; // Declarar fuera del try/catch para el ámbito

    // Intentar obtener el documento del usuario primero
    try {
        userDocSnap = await getDoc(userDocRef);
    } catch (error) {
        console.error("APP: Error inicial al obtener userDoc en onAuthStateChanged:", error);
        mostrarMensaje("Error al cargar perfil de usuario. Recarga la página.", "error", "global-mensaje");
        // En un caso crítico, podrías forzar el cierre de sesión para evitar un estado inconsistente
        // signOut(auth);
        return;
    }


    let userNameFromInput = localStorage.getItem('temp_register_name');
    let profileDisplayName = user.displayName;

    // Lógica para asegurar que el displayName de Firebase Auth esté seteado y sincronizado
    if (!profileDisplayName && userNameFromInput) {
        // Si no hay displayName en Auth pero sí en localStorage (de un registro reciente)
        await updateProfile(user, { displayName: userNameFromInput });
        profileDisplayName = userNameFromInput;
        console.log("APP: DisplayName de Auth actualizado con nombre del registro temporal."); // Depuración
    } else if (!profileDisplayName && userDocSnap.exists() && userDocSnap.data().nombreOriginal) {
        // Si no hay displayName en Auth pero sí en Firestore
        await updateProfile(user, { displayName: userDocSnap.data().nombreOriginal });
        profileDisplayName = userDocSnap.data().nombreOriginal;
        console.log("APP: DisplayName de Auth actualizado desde Firestore."); // Depuración
    } else if (!profileDisplayName) {
        // Fallback si no hay displayName en Auth, en localStorage ni en Firestore
        await updateProfile(user, { displayName: user.email.split('@')[0] });
        profileDisplayName = user.email.split('@')[0];
        console.log("APP: DisplayName de Auth actualizado a partir del email."); // Depuración
    }

    // --- Lógica para CREAR/ACTUALIZAR el documento de usuario en Firestore CON REINTENTOS ---
    if (!userDocSnap.exists()) {
      console.log("APP: Documento de usuario NO existe en Firestore. Intentando crearlo con reintentos...");
      try {
        await retryOperation(async () => {
          await setDoc(userDocRef, {
            email: user.email,
            nombre: profileDisplayName.toLowerCase(),
            nombreOriginal: profileDisplayName,
            uid: user.uid,
            esCapitan: false,
            equipoCapitaneadoId: null,
            createdAt: serverTimestamp() // Usa serverTimestamp para la hora de creación
          }, { merge: true }); // Usar merge: true para ser más indulgente si hay una race condition muy rápida
        }, 5); // 5 reintentos (1 intento original + 4 reintentos exponenciales)
        
        console.log("APP: Documento de usuario creado/actualizado en Firestore con éxito (tras reintentos si hubo). UID:", user.uid);
        localStorage.removeItem('temp_register_name'); // Limpiar nombre temporal después de la creación exitosa

      } catch (error) {
        console.error("APP: Error FATAL al crear documento de usuario en Firestore (onAuthStateChanged).", error);
        mostrarMensaje("Error crítico al inicializar perfil. Contacta a soporte o intenta de nuevo más tarde.", "error", "global-mensaje");
        // Opcionalmente, forzar el cierre de sesión para evitar un estado inconsistente si la creación del perfil falla críticamente
        signOut(auth);
        return;
      }
    } else {
        console.log("APP: Documento de usuario YA existe en Firestore. Sincronizando si es necesario.");
        // Si el documento YA EXISTE, asegurar que los campos de nombre sean correctos en Firestore.
        const userData = userDocSnap.data();
        let needsUpdateInFirestore = false;
        // Usar el profileDisplayName ya actualizado de Firebase Auth para sincronizar con Firestore
        const newNombreOriginalFirestore = profileDisplayName;
        const newNombreFirestore = profileDisplayName.toLowerCase();

        if (userData.nombreOriginal !== newNombreOriginalFirestore || userData.nombre !== newNombreFirestore) {
            needsUpdateInFirestore = true;
        }

        if (needsUpdateInFirestore) {
           try {
               await updateDoc(userDocRef, {
                   nombre: newNombreFirestore,
                   nombreOriginal: newNombreOriginalFirestore,
               });
               console.log("APP: Perfil de usuario actualizado con nombre en Firestore vía onAuthStateChanged para UID:", user.uid); // Depuración
           } catch (updateError) {
               console.error("APP: Error al actualizar nombre en perfil de usuario (onAuthStateChanged):", updateError);
           }
        }
        localStorage.removeItem('temp_register_name'); // Limpiar nombre temporal
    }
    
    // Continuar con la visualización del perfil y listeners
    displayUserProfile(user); 
    setupInvitationsListener(user.uid); 
    const currentHash = window.location.hash.substring(1);
    if (currentHash === '' || currentHash === 'cuenta') {
        navigateTo('partidos');
    } else {
        navigateTo(currentHash);
    }
  } else {
    console.log("APP: onAuthStateChanged: NO hay usuario autenticado. Mostrando formularios de autenticación."); // Depuración
    // Si no hay usuario, limpiar el contador de notificaciones
    if (notificationCountSpan) {
        notificationCountSpan.textContent = '0';
        notificationCountSpan.style.display = 'none';
    }
    // Desactivar listener si el usuario se desloguea
    if (unsubscribeInvitationsListener) {
        unsubscribeInvitationsListener(); 
        unsubscribeInvitationsListener = null;
    }

    renderAuthForm(false); // <--- ESTA LÍNEA ES CRUCIAL PARA MOSTRAR LOS FORMULARIOS
    const currentHash = window.location.hash.substring(1);
    // Si el usuario no está autenticado y está en una ruta protegida, redirigir a cuenta
    if (['explorar', 'crear', 'partidos', 'notificaciones', 'torneo'].includes(currentHash)) {
        navigateTo('cuenta');
    }
    // Limpiar el nombre temporal si el usuario se desloguea
    localStorage.removeItem('temp_register_name');
  }
});


// Inicializar la aplicación: determina la página a mostrar al cargar
document.addEventListener('DOMContentLoaded', () => {
    console.log("APP: DOMContentLoaded: Evento disparado."); // Depuración
    
    // Verificación temprana del elemento crítico 'cuenta-section'
    const cuentaSectionCheck = document.getElementById('cuenta-section');
    if (!cuentaSectionCheck) {
        console.error("APP: DOMContentLoaded: Elemento 'cuenta-section' no encontrado. La aplicación no funcionará correctamente.");
        mostrarMensaje("Error fatal: No se pudo iniciar la interfaz de usuario. Contacta al soporte.", "error", "global-mensaje");
        return; // Detener la ejecución si el elemento crítico no está presente
    }

    // Inicializar listeners de la barra lateral (navLinks) una vez que DOM esté cargado
    // Estos listeners son globales y llaman a navigateTo, que ya está definida globalmente
    navLinks.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const path = link.getAttribute('href').substring(1);
        navigateTo(path);
      });
    });

    // Listener para popstate
    window.addEventListener('popstate', () => {
      const path = window.location.hash.substring(1) || 'cuenta';
      navigateTo(path);
    });

    const btnCrear = document.getElementById("btnCrear");
    if (btnCrear) {
        btnCrear.addEventListener("click", crearPartido);
    } else {
        console.warn("APP: DOMContentLoaded: Botón 'btnCrear' no encontrado."); // Depuración
    }

    const initialPath = window.location.hash.substring(1) || 'cuenta';
    console.log("APP: DOMContentLoaded: Navegando a la ruta inicial:", initialPath); // Depuración

    // Usar Promise.resolve().then() para empujar la llamada a navigateTo
    // a la cola de microtasks, asegurando que el script principal ha terminado de evaluarse
    // y que navigateTo esté disponible en el ámbito del DOMContentLoaded.
    Promise.resolve().then(() => {
        if (typeof navigateTo === 'function') { // Verificar si navigateTo es una función
            navigateTo(initialPath);
        } else {
            console.error("ERROR CRÍTICO: navigateTo NO ESTÁ DEFINIDA. Problema de carga o ámbito de script.");
            mostrarMensaje("Error interno de la aplicación. Por favor, recarga la página.", "error", "global-mensaje");
        }
    });
});

// Listener para errores no capturados (para depuración general)
window.addEventListener('unhandledrejection', event => {
  console.error('APP: Unhandled Promise Rejection:', event.promise, event.reason);
  mostrarMensaje(`Error inesperado (promesa): ${event.reason.message || event.reason}`, "error", "global-mensaje");
});

window.addEventListener('error', event => {
    console.error('APP: Uncaught Error:', event.message, event.filename, event.lineno, event.colno, event.error);
    mostrarMensaje(`Error en la aplicación: ${event.message}`, "error", "global-mensaje");
});
