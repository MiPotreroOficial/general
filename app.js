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
  deleteDoc
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
  if (path === 'crear') {
    // Si vamos a la sección "crear", pre-poblamos los selects
    populateCrearPartidoSelects();
  } else {
    // Si salimos de "crear", limpiamos los campos y mensajes específicos
    const lugarInput = document.getElementById('lugar');
    const fechaInput = document.getElementById('fecha');
    const tipoFutbolSelect = document.getElementById('tipoFutbol');
    const crearPartidoConEquipoSelect = document.getElementById('crearPartidoConEquipo');
    // const equipoRivalSelect = document.getElementById('equipoRivalSelect'); // Eliminado
    const mensajeCrear = document.getElementById('mensaje-crear');

    if (lugarInput) lugarInput.value = '';
    if (fechaInput) fechaInput.value = '';
    if (tipoFutbolSelect) tipoFutbolSelect.value = '';
    if (crearPartidoConEquipoSelect) crearPartidoConEquipoSelect.innerHTML = '<option value="">Selecciona tu equipo</option>';
    // if (equipoRivalSelect) equipoRivalSelect.innerHTML = '<option value="">Selecciona un equipo para invitar</option>'; // Eliminado
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
      // populateCrearPartidoSelects() ya se llama al inicio de navigateTo si path === 'crear'
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

// --- Lógica de Autenticación para Cuenta (Con gestión de equipo) ---
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
                // Actualiza el nombre del capitán y el nombre en la lista de jugadores del equipo
                const updatedJugadoresNombres = equipoData.jugadoresNombres.map(name => 
                    (name === userName ? newName : name) // Usa el 'userName' original de la carga de perfil
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

  // Lógica de Equipo
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
        // Es jugador en al menos un equipo, mostrar los equipos
        let equiposJugador = [];
        jugadorEnEquiposSnap.forEach(doc => {
            equiposJugador.push({ id: doc.id, nombre: doc.data().nombre });
        });
        equipoDetailsDiv.innerHTML = `<p>Eres jugador en los equipos: ${equiposJugador.map(e => e.nombre).join(', ')}</p>`;
        // No hay opción de crear equipo si ya es jugador de uno
    } else {
        // No es capitán ni jugador en ningún equipo, ofrecer crear equipo
        equipoDetailsDiv.innerHTML = `
            <p>Aún no eres capitán de ningún equipo ni jugador en uno. ¡Crea tu propio equipo!</p>
            <input type="text" id="new-team-name" placeholder="Nombre de tu nuevo equipo">
            <button id="btn-create-team">Crear Equipo</button>
        `;
        document.getElementById('btn-create-team').addEventListener('click', createTeam);
    }
  }
}

// --- Funciones de Gestión de Equipo ---

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

        // Desvincular al capitán de su equipo en su documento de usuario
        await updateDoc(doc(db, "usuarios", user.uid), {
            esCapitan: false,
            equipoCapitaneadoId: null
        });

        // Eliminar el equipo
        await deleteDoc(teamRef);

        mostrarMensaje("Equipo eliminado exitosamente.", "exito", "global-mensaje");
        displayUserProfile(user); // Recargar la vista del perfil
    } catch (error) {
        mostrarMensaje("Error al eliminar equipo: " + error.message, "error", "global-mensaje");
    }
}


onAuthStateChanged(auth, async user => { // <-- Hacer esta función async
  if (user) {
    // Verificar si el documento del usuario existe en Firestore
    const userDocRef = doc(db, "usuarios", user.uid);
    const userDocSnap = await getDoc(userDocRef);

    if (!userDocSnap.exists()) {
      // Si el documento NO existe, crearlo con valores por defecto
      try {
        await setDoc(userDocRef, {
          email: user.email,
          nombre: user.displayName || user.email.split('@')[0], // Usa displayName o parte del email
          uid: user.uid,
          esCapitan: false,
          equipoCapitaneadoId: null
        });
        console.log("Documento de usuario creado en Firestore para UID:", user.uid);
      } catch (error) {
        console.error("Error al crear documento de usuario en Firestore:", error);
        mostrarMensaje("Error al inicializar perfil de usuario. Intenta de nuevo más tarde.", "error", "global-mensaje");
      }
    }
    
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

// Rellena el select de "Crear partido con mi equipo"
async function populateCrearPartidoSelects() {
    const crearPartidoConEquipoSelect = document.getElementById('crearPartidoConEquipo');
    // const equipoRivalSelect = document.getElementById('equipoRivalSelect'); // Eliminado
    if (!crearPartidoConEquipoSelect) return; // Eliminar || !equipoRivalSelect

    crearPartidoConEquipoSelect.innerHTML = '<option value="">Selecciona tu equipo</option>';
    // equipoRivalSelect.innerHTML = '<option value="">Selecciona un equipo para invitar (Opcional)</option>'; // Eliminado

    try {
        const user = auth.currentUser;
        if (!user) { // Si no hay usuario, no se pueden cargar equipos
            crearPartidoConEquipoSelect.innerHTML = '<option value="">Inicia sesión para ver equipos</option>';
            // equipoRivalSelect.innerHTML = '<option value="">Inicia sesión para ver equipos</option>'; // Eliminado
            return;
        }

        // Buscar todos los equipos de los que el usuario es jugador (o capitán)
        const qJugadorEnEquipos = query(equiposCol, where("jugadoresUids", "array-contains", user.uid));
        const jugadorEquiposSnap = await getDocs(qJugadorEnEquipos);
        
        let misEquiposDisponibles = [];
        jugadorEquiposSnap.forEach(doc => {
            misEquiposDisponibles.push({ id: doc.id, nombre: doc.data().nombre });
        });

        if (misEquiposDisponibles.length === 0) {
            crearPartidoConEquipoSelect.innerHTML = '<option value="">No estás en ningún equipo</option>';
        } else {
            for (const equipo of misEquiposDisponibles) {
                const option = document.createElement('option');
                option.value = equipo.id;
                option.textContent = equipo.nombre;
                crearPartidoConEquipoSelect.appendChild(option);
            }
        }

        // SE ELIMINA LA LÓGICA DE POPULAR EL SELECT DE EQUIPO RIVAL
        // if (userDocData && userDocData.esCapitan && userDocData.equipoCapitaneadoId) { ... }
        // else { equipoRivalSelect.innerHTML = '<option value="">Solo capitanes pueden invitar rivales</option>'; }

    } catch (error) {
        console.error("Error al cargar selects de creación de partido:", error);
        mostrarMensaje("Error al cargar opciones de equipos: " + error.message, "error", "global-mensaje");
    }
}


// Carga los partidos disponibles
async function cargarPartidos() {
  const lista = document.getElementById("lista-partidos");
  if (!lista) return;
  lista.innerHTML = "";

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  try {
    const snapshot = await getDocs(partidosCol);
    if (snapshot.empty) {
      lista.innerHTML = "<p>No hay partidos disponibles en este momento.</p>";
      return;
    }
    // Usar for...of para asegurar que las promesas internas se resuelvan en orden
    for (const docSnapshot of snapshot.docs) {
      const p = docSnapshot.data();
      const partidoId = docSnapshot.id;

      const fechaPartido = new Date(p.fecha);
      if (fechaPartido < hoy) continue; // No mostrar partidos pasados

      // Obtener nombres de equipos
      const equipo1Nombre = await getTeamNameById(p.equipo1Id);
      const equipo2Nombre = p.equipo2Id ? await getTeamNameById(p.equipo2Id) : "Vacante";

      const div = document.createElement("div");
      div.className = "partido";
      const fechaFormateada = fechaPartido.toLocaleString();
      
      div.innerHTML = `
        <h3>${p.lugar}</h3>
        <p class="fecha-partido"><strong>Fecha:</strong> ${fechaFormateada}</p>
        <p><strong>Tipo:</strong> ${p.tipoFutbol} (${p.cupos} jugadores por equipo)</p>
        <p><strong>Equipos:</strong> ${equipo1Nombre} vs ${equipo2Nombre}</p>
      `;

      if (auth.currentUser) {
        const userDocRef = doc(db, "usuarios", auth.currentUser.uid);
        const userDocSnap = await getDoc(userDocRef);
        const userDocData = userDocSnap.data();

        // Obtener todos los equipos a los que pertenece el usuario actual
        let currentUserTeamsIds = [];
        const qUserTeams = query(equiposCol, where("jugadoresUids", "array-contains", auth.currentUser.uid));
        const userTeamsSnap = await getDocs(qUserTeams);
        userTeamsSnap.forEach(teamDoc => currentUserTeamsIds.push(teamDoc.id));

        const isUserInEquipo1 = currentUserTeamsIds.includes(p.equipo1Id);
        const isUserInEquipo2 = p.equipo2Id && currentUserTeamsIds.includes(p.equipo2Id);

        // Lógica del botón "Unirse" para Equipo 2
        // Solo un capitán puede unir a su equipo como Equipo 2
        if (userDocData && userDocData.esCapitan && userDocData.equipoCapitaneadoId) {
            const miEquipoId = userDocData.equipoCapitaneadoId;

            if (p.equipo1Id === miEquipoId) {
                div.innerHTML += `<span style="color: blue;">(Tu equipo lo creó)</span>`;
            } 
            else if (p.equipo2Id === miEquipoId) {
                div.innerHTML += `<span style="color: green;">(Tu equipo ya está inscrito)</span>`;
            }
            else if (!p.equipo2Id) { // Si Equipo 2 está vacante
                const btn = document.createElement("button");
                btn.textContent = "Unirse (como Equipo 2)";
                btn.onclick = () => unirseAPartido(partidoId, p, miEquipoId, userDocData.nombre); 
                div.appendChild(btn);
            } else { // Equipo 2 ya ocupado
                div.innerHTML += `<span style="color: orange;">(Partido con dos equipos)</span>`;
            }
        } else { // Si el usuario no es capitán
            if (isUserInEquipo1 || isUserInEquipo2) {
                // Si ya está en un equipo participante del partido, no necesita unirse
                div.innerHTML += `<span style="color: purple;">(Tu equipo participa en este partido)</span>`;
            } else {
                // Usuario no es capitán ni está en ningún equipo del partido
                div.innerHTML += `<span style="color: gray;">(Debes ser capitán de un equipo para unirte como Equipo 2)</span>`;
            }
        }
      }
      lista.appendChild(div);
    }
  } catch (e) {
    console.error("Error al cargar partidos:", e);
    mostrarMensaje("Error al cargar partidos: " + e.message, "error", "global-mensaje");
  }
}

// Función para crear partido (Permite a cualquier jugador crear, eligiendo su equipo)
async function crearPartido() {
  const crearPartidoConEquipoId = document.getElementById('crearPartidoConEquipo').value; // <-- Aquí se obtiene
  const lugarInput = document.getElementById("lugar");
  const lugar = lugarInput.value.trim();
  const fechaInput = document.getElementById("fecha").value;
  const tipoFutbol = document.getElementById('tipoFutbol').value; // Nuevo campo
  const currentUser = auth.currentUser;

  // Se eliminan validaciones de equipoRivalId

  if (!crearPartidoConEquipoId || !lugar || !fechaInput || !tipoFutbol) {
    mostrarMensaje("Por favor, completa todos los campos obligatorios.", "error", "mensaje-crear");
    return;
  }
  if (!currentUser) {
      mostrarMensaje("Debes iniciar sesión para crear un partido.", "error", "mensaje-crear");
      return;
  }

  // --- Obtener datos del equipo con el que se crea el partido ---
  const equipoCreadorRef = doc(db, "equipos", crearPartidoConEquipoId); // <-- Usar esta variable
  const equipoCreadorSnap = await getDoc(equipoCreadorRef);
  if (!equipoCreadorSnap.exists()) {
      mostrarMensaje("Error: El equipo seleccionado para crear el partido no es válido.", "error", "mensaje-crear");
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
  // Asegurarse de comparar solo la fecha (día, mes, año) sin la hora para evitar problemas de "pasado"
  hoy.setHours(0, 0, 0, 0); 
  fechaSeleccionada.setHours(0, 0, 0, 0); // También ajustar la fecha seleccionada a 00:00:00 para la comparación

  if (fechaSeleccionada < hoy) {
    mostrarMensaje("No puedes crear partidos en fechas pasadas.", "error", "mensaje-crear");
    return;
  }

  const maxFecha = new Date();
  maxFecha.setDate(hoy.getDate() + 30);
  maxFecha.setHours(23, 59, 59, 999); // Establecer al final del día para la comparación

  if (fechaSeleccionada > maxFecha) {
    mostrarMensaje("No puedes crear partidos con más de 30 días de anticipación.", "error", "mensaje-crear");
    return;
  }
  
  // --- No hay lógica de Equipo 2 invitando al crear el partido ---
  // El partido se crea solo con Equipo 1. Equipo 2 será "Vacante".

  const partido = {
    lugar: lugar,
    fecha: fechaInput, // Guardar la fecha tal cual del input (ISO string completo)
    tipoFutbol: tipoFutbol,
    cupos: cuposPorEquipo,
    creadorUid: currentUser.uid,
    creadorEmail: currentUser.email,
    equipo1Id: crearPartidoConEquipoId, // Usa el ID del equipo seleccionado
    equipo1Nombre: equipoCreadorData.nombre, // Usa el nombre del equipo seleccionado
    equipo2Id: null, // Inicialmente null
    equipo2Nombre: null, // Inicialmente null
  };

  addDoc(partidosCol, partido).then(() => {
    mostrarMensaje("¡Partido creado exitosamente!", "exito", "global-mensaje");
    // Limpiar el formulario
    document.getElementById('crearPartidoConEquipo').value = '';
    document.getElementById("lugar").value = '';
    document.getElementById("fecha").value = '';
    document.getElementById('tipoFutbol').value = '';
    navigateTo('partidos');
  }).catch(e => mostrarMensaje("Error al crear partido: " + e.message, "error", "mensaje-crear"));
}

// Carga los partidos donde el usuario es parte de alguno de los equipos
async function cargarMisPartidos() {
  const cont = document.getElementById("mis-partidos");
  if (!cont) return;
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
        return;
    }

    // Consultar partidos donde el equipo del usuario es Equipo 1 o Equipo 2
    // Se hacen dos consultas para manejar el "OR" entre campos.
    const qPartidosEquipo1 = query(partidosCol, where("equipo1Id", "in", misEquiposIds));
    const snapshotEquipo1 = await getDocs(qPartidosEquipo1);

    const qPartidosEquipo2 = query(partidosCol, where("equipo2Id", "in", misEquiposIds));
    const snapshotEquipo2 = await getDocs(qPartidosEquipo2);

    const allMyMatches = new Map(); // Usar un mapa para evitar duplicados
    snapshotEquipo1.forEach(doc => allMyMatches.set(doc.id, { id: doc.id, data: doc.data() }));
    snapshotEquipo2.forEach(doc => allMyMatches.set(doc.id, { id: doc.id, data: doc.data() }));


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

      div.className = "partido";
      div.innerHTML = `
        <h3>${p.lugar}</h3>
        <p class="fecha-partido"><strong>Fecha:</strong> ${fechaFormateada}</p>
        <p><strong>Tipo:</strong> ${p.tipoFutbol} (${p.cupos} jugadores por equipo)</p>
        <p><strong>Equipos:</strong> ${equipo1Nombre} vs ${equipo2Nombre} ${estado}</p>
      `;
      cont.appendChild(div);
    }
  } catch (e) {
    console.error("Error al cargar mis partidos:", e);
    mostrarMensaje("Error al cargar mis partidos: " + e.message, "error", "global-mensaje");
  }
}

// Unirse a un partido como Equipo 2 (Solo capitanes de un equipo que no sea el equipo1)
window.unirseAPartido = async function(partidoId, partidoData, miEquipoId, miEquipoNombre) {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    mostrarMensaje("Debes iniciar sesión para unirte a un partido.", "error", "global-mensaje");
    navigateTo('cuenta');
    return;
  }

  // Verificar que el usuario que se une sea capitán y tenga el equipo correcto
  const userDocRef = doc(db, "usuarios", currentUser.uid);
  const userDocSnap = await getDoc(userDocRef);
  if (!userDocSnap.exists() || !userDocSnap.data().esCapitan || userDocSnap.data().equipoCapitaneadoId !== miEquipoId) {
      mostrarMensaje("Solo los capitanes pueden unir su equipo a un partido.", "error", "global-mensaje");
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

  try {
    await updateDoc(partidoRef, {
      equipo2Id: miEquipoId,
      equipo2Nombre: miEquipoNombre
    });
    mostrarMensaje("Tu equipo se ha unido al partido exitosamente!", "exito", "global-mensaje");
    cargarPartidos(); // Refrescar ambos listados
    cargarMisPartidos();
  } catch (e) {
    mostrarMensaje("Error al unirse al partido: " + e.message, "error", "global-mensaje");
  }
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
