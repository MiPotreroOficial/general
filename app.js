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
  arrayUnion, // Importa arrayUnion para añadir elementos a arrays
  arrayRemove, // Importa arrayRemove para quitar elementos de arrays
  deleteDoc // Importa deleteDoc para eliminar documentos
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
const equiposCol = collection(db, "equipos"); // ¡Nueva colección para equipos!

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
    if (lugarInput) lugarInput.value = '';
    const equipoRivalSelect = document.getElementById('equipoRivalSelect');
    if (equipoRivalSelect) equipoRivalSelect.innerHTML = '<option value="">Selecciona un equipo para invitar</option>'; // Limpiar y resetear
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
      populateEquipoRivalSelect(); // Cargar los equipos para invitar
      break;
    case 'partidos':
      showSection('partidos-section');
      cargarPartidos();
      cargarMisPartidos();
      break;
    case 'cuenta':
      showSection('cuenta-section');
      // onAuthStateChanged ya maneja lo que se muestra aquí
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

// --- Lógica de Autenticación para Cuenta (¡Con gestión de equipo!) ---
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

        // Inicializar el documento de usuario en Firestore con rol de capitán
        await setDoc(doc(db, "usuarios", user.uid), {
          email: user.email,
          nombre: nombre,
          uid: user.uid,
          esCapitan: false, // Por defecto no es capitán al registrarse
          equipoCapitaneadoId: null
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
  let userDocData;

  if (user.uid) {
    const userDocRef = doc(db, "usuarios", user.uid);
    const userDocSnap = await getDoc(userDocRef);
    if (userDocSnap.exists()) {
      userDocData = userDocSnap.data();
      userName = userDocData.nombre || user.email; // Prefiere el nombre de Firestore
    }
  }
  if (!userName) { // Fallback si no hay displayName ni nombre en Firestore
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
    
    <div id="equipo-section-container" style="margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px;">
      <h3>Mi Equipo</h3>
      <div id="equipo-details"></div>
    </div>
  `;

  // Lógica para editar el nombre (personal del usuario)
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
        
        // Si el usuario es capitán, también actualiza su nombre en el equipo
        if (userDocData && userDocData.esCapitan && userDocData.equipoCapitaneadoId) {
            const equipoRef = doc(db, "equipos", userDocData.equipoCapitaneadoId);
            const equipoSnap = await getDoc(equipoRef);
            if(equipoSnap.exists()){
                const equipoData = equipoSnap.data();
                const updatedJugadoresNombres = equipoData.jugadoresNombres.map(name => 
                    (name === userDocData.nombre ? newName : name) // Asume que el nombre anterior está allí
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

  // Lógica de Equipo (NUEVO)
  const equipoDetailsDiv = document.getElementById('equipo-details');
  if (userDocData && userDocData.esCapitan && userDocData.equipoCapitaneadoId) {
    // Es capitán, mostrar detalles del equipo
    const equipoRef = doc(db, "equipos", userDocData.equipoCapitaneadoId);
    const equipoSnap = await getDoc(equipoRef);
    if (equipoSnap.exists()) {
      const equipoData = equipoSnap.data();
      equipoDetailsDiv.innerHTML = `
        <p><strong>Eres Capitán del Equipo:</strong> ${equipoData.nombre}</p>
        <p><strong>Jugadores:</strong></p>
        <ul id="team-players-list">
          ${equipoData.jugadoresNombres.map(jugador => `<li>${jugador}</li>`).join('')}
        </ul>
        <input type="email" id="invite-player-email" placeholder="Email del jugador a invitar">
        <button id="btn-invite-player">Invitar Jugador</button>
        <button id="btn-delete-team" style="background-color: #dc3545;">Eliminar Equipo</button>
      `;
      document.getElementById('btn-invite-player').addEventListener('click', () => invitePlayerToTeam(equipoData.id));
      document.getElementById('btn-delete-team').addEventListener('click', () => deleteTeam(equipoData.id, user.uid));
    } else {
      // Equipo no encontrado en Firestore, corregir estado de usuario
      await updateDoc(doc(db, "usuarios", user.uid), { esCapitan: false, equipoCapitaneadoId: null });
      displayUserProfile(user); // Recargar la vista del perfil
    }
  } else {
    // No es capitán, o su equipo no está asignado
    const q = query(equiposCol, where("jugadoresUids", "array-contains", user.uid));
    const jugadorEnEquiposSnap = await getDocs(q);

    if (!jugadorEnEquiposSnap.empty) {
        // Es jugador en al menos un equipo
        let equiposJugador = [];
        jugadorEnEquiposSnap.forEach(doc => {
            equiposJugador.push(doc.data().nombre);
        });
        equipoDetailsDiv.innerHTML = `<p>Eres jugador en los equipos: ${equiposJugador.join(', ')}</p>`;
    } else {
        // No es capitán ni jugador en ningún equipo
        equipoDetailsDiv.innerHTML = `
            <p>Aún no eres capitán de ningún equipo. ¡Crea uno!</p>
            <input type="text" id="new-team-name" placeholder="Nombre de tu nuevo equipo">
            <button id="btn-create-team">Crear Equipo</button>
        `;
        document.getElementById('btn-create-team').addEventListener('click', createTeam);
    }
  }
}

// --- Funciones de Gestión de Equipo (NUEVAS) ---

async function createTeam() {
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

    const userDocRef = doc(db, "usuarios", user.uid);
    const userDocSnap = await getDoc(userDocRef);
    if (userDocSnap.exists() && userDocSnap.data().esCapitan) {
        mostrarMensaje("Ya eres capitán de un equipo. No puedes crear otro.", "error", "global-mensaje");
        return;
    }
    // Asegurarse de que el usuario tenga un nombre de jugador establecido
    if (!user.displayName) {
        mostrarMensaje("Por favor, establece tu nombre de jugador en tu perfil antes de crear un equipo.", "error", "global-mensaje");
        return;
    }

    try {
        const newTeamRef = await addDoc(equiposCol, {
            nombre: teamName,
            capitanUid: user.uid,
            capitanEmail: user.email,
            capitanNombre: user.displayName, // Usa el displayName de Auth
            jugadoresUids: [user.uid],
            jugadoresNombres: [user.displayName] // El capitán es el primer jugador
        });

        // Actualizar el estado del usuario para que sea capitán de este equipo
        await updateDoc(userDocRef, {
            esCapitan: true,
            equipoCapitaneadoId: newTeamRef.id
        });

        mostrarMensaje(`Equipo "${teamName}" creado exitosamente!`, "exito", "global-mensaje");
        displayUserProfile(user); // Recargar la vista del perfil
    } catch (error) {
        mostrarMensaje("Error al crear equipo: " + error.message, "error", "global-mensaje");
    }
}

async function invitePlayerToTeam(teamId) {
    const user = auth.currentUser;
    if (!user) return; // Ya debería estar logueado
    const playerEmailInput = document.getElementById('invite-player-email');
    const playerEmail = playerEmailInput.value.trim();
    if (!playerEmail) {
        mostrarMensaje("Por favor, introduce el email del jugador a invitar.", "error", "global-mensaje");
        return;
    }
    if (playerEmail === user.email) {
        mostrarMensaje("Ya eres parte de tu equipo.", "info", "global-mensaje");
        return;
    }


    try {
        // 1. Buscar al jugador por email en la colección de usuarios
        const q = query(usuariosCol, where("email", "==", playerEmail));
        const playerSnap = await getDocs(q);
        if (playerSnap.empty) {
            mostrarMensaje("No se encontró ningún usuario registrado con ese email.", "error", "global-mensaje");
            return;
        }
        const playerData = playerSnap.docs[0].data();
        const playerUid = playerSnap.docs[0].id;
        const playerName = playerData.nombre || playerEmail; // Usa el nombre de Firestore o el email

        // 2. Verificar que el jugador no esté ya en el equipo
        const teamRef = doc(db, "equipos", teamId);
        const teamSnap = await getDoc(teamRef);
        if (!teamSnap.exists()) {
            mostrarMensaje("Error: Equipo no encontrado.", "error", "global-mensaje");
            return;
        }
        const teamData = teamSnap.data();
        if (teamData.jugadoresUids.includes(playerUid)) {
            mostrarMensaje("Ese jugador ya está en tu equipo.", "info", "global-mensaje");
            return;
        }

        // 3. Añadir al jugador al equipo
        await updateDoc(teamRef, {
            jugadoresUids: arrayUnion(playerUid),
            jugadoresNombres: arrayUnion(playerName)
        });

        mostrarMensaje(`${playerName} ha sido añadido a tu equipo.`, "exito", "global-mensaje");
        playerEmailInput.value = ''; // Limpiar campo
        displayUserProfile(user); // Recargar perfil para ver cambios
    } catch (error) {
        mostrarMensaje("Error al invitar jugador: " + error.message, "error", "global-mensaje");
    }
}

async function deleteTeam(teamId, captainUid) {
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

        // 1. Desvincular al capitán de su equipo en su documento de usuario
        await updateDoc(doc(db, "usuarios", user.uid), {
            esCapitan: false,
            equipoCapitaneadoId: null
        });

        // 2. Opcional: Si hubiese un campo 'equipoActualId' en los documentos de los jugadores,
        // tendrías que iterar sobre ellos y limpiarlo. Por ahora, no lo tenemos.

        // 3. Eliminar el equipo
        await deleteDoc(teamRef);

        mostrarMensaje("Equipo eliminado exitosamente.", "exito", "global-mensaje");
        displayUserProfile(user); // Recargar la vista del perfil
    } catch (error) {
        mostrarMensaje("Error al eliminar equipo: " + error.message, "error", "global-mensaje");
    }
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

// --- Funciones de Partidos (Modificadas para equipos) ---

// Función para obtener el nombre de un usuario por su email
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

// Función para obtener el nombre de un equipo por su ID
async function getTeamNameById(teamId) {
    if (!teamId) return "Equipo Desconocido";
    try {
        const teamDocRef = doc(db, "equipos", teamId);
        const teamDocSnap = await getDoc(teamDocRef);
        if (teamDocSnap.exists()) {
            return teamDocSnap.data().nombre;
        }
    } catch (error) {
        console.error("Error al obtener nombre de equipo por ID:", error);
    }
    return "Equipo Desconocido";
}

// Llenar el select de equipos rivales en la sección "Crear Partido"
async function populateEquipoRivalSelect() {
    const select = document.getElementById('equipoRivalSelect');
    if (!select) return;

    select.innerHTML = '<option value="">Selecciona un equipo para invitar (Opcional)</option>';

    try {
        const user = auth.currentUser;
        if (!user) { // Si no hay usuario, no se pueden cargar equipos
            select.innerHTML = '<option value="">Inicia sesión para ver equipos</option>';
            return;
        }

        const userDocRef = doc(db, "usuarios", user.uid);
        const userDocSnap = await getDoc(userDocRef);
        const userDocData = userDocSnap.data();
        
        if (!userDocData || !userDocData.esCapitan || !userDocData.equipoCapitaneadoId) {
             select.innerHTML = '<option value="">Debes ser capitán de un equipo para invitar</option>';
             return;
        }

        const capitanEquipoId = userDocData.equipoCapitaneadoId;

        const snapshot = await getDocs(equiposCol);
        snapshot.forEach(doc => {
            const equipo = doc.data();
            // No mostrar mi propio equipo en la lista de rivales
            if (doc.id !== capitanEquipoId) {
                const option = document.createElement('option');
                option.value
