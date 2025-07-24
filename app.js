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
  const firebaseConfig = { 
    apiKey: "AIzaSyBRo2ZoKk-XbgPkNl1BOtRcGhSB4JEuocM", 
    authDomain: "mi-potrero-partidos.firebaseapp.com", 
    projectId: "mi-potrero-partidos", 
    storageBucket: "mi-potrero-partidos.firebasestorage.app", 
    messagingSenderId: "555922222113", 
    appId: "1:555922222113:web:dd2f79d5e20f0d96cac760",
    measurementId: "G-7LBJ29RXKM" };
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
  }
}

function hideAllSections() {
  allSections.forEach(section => {
    section.classList.add('hidden');
    section.classList.remove('active-section');
  });
}

function showSection(sectionId) {
  if (!document.getElementById(sectionId)) { // Comprobar existencia antes de manipular
    console.error("APP: showSection: Elemento con ID", sectionId, "no encontrado en el DOM.");
    return;
  }
  hideAllSections();
  const sectionToShow = document.getElementById(sectionId);
  sectionToShow.classList.remove('hidden');
  sectionToShow.classList.add('active-section');
}


// --- 2. TODAS LAS DEMÁS FUNCIONES AUXILIARES (MOVIDAS ARRIBA) ---

// Funciones de consulta de datos (para equipos y usuarios)
async function getUserNameByEmail(userEmail) {
    if (!userEmail) return "Desconocido";
    try {
        const q = query(usuariosCol, where("email", "==", userEmail));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
            return querySnapshot.docs[0].data().nombreOriginal || querySnapshot.docs[0].data().nombre || userEmail;
        }
    } catch (error) {
        console.error("FUNC: Error al obtener nombre por email:", error);
    }
    return userEmail;
}

async function getTeamNameById(teamId) {
    if (!teamId) return "Equipo Desconocido";
    try {
        const teamDocRef = doc(db, "equipos", teamId);
        const teamDocSnap = await getDoc(teamDocRef);
        if (teamDocSnap.exists()) {
            return teamDocSnap.data().nombre;
        }
    } catch (error) {
        console.error("FUNC: Error al obtener nombre de equipo por ID:", error);
    }
    return "Equipo Desconocido";
}

// Funciones de Gestión de Equipo (createTeam, searchAndAddPlayer, deleteTeam)
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
            resultDiv.innerHTML = `
                <span>${displayPlayerName} (${playerData.email})</span>
                <button data-player-uid="${playerUid}" data-player-name="${displayPlayerName}" data-player-email="${playerData.email}"
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

                try {
                    await addDoc(invitacionesCol, {
                        equipoId: teamId,
                        equipoNombre: teamData.nombre,
                        capitanUid: user.uid,
                        capitanNombre: user.displayName || user.email,
                        invitadoUid: playerUidToAdd,
                        invitadoEmail: playerEmailToAdd,
                        estado: "pendiente",
                        timestamp: serverTimestamp()
                    });
                    console.log(`FUNC: Invitación enviada a ${playerNameToAdd}.`);
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
        displayUserProfile(user);
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
            mostrarMensaje("Error: Tu perfil de usuario no se encontró.", "error", "global-mensaje");
            return;
        }
        const userData = userDocSnap.data();
        const userNameOriginal = userData.nombreOriginal || userData.nombre || user.email;

        // Actualizar estado de la invitación a 'aceptada'
        await updateDoc(invitacionRef, { estado: "aceptada" });
        console.log("FUNC: Estado de invitación actualizado a 'aceptada'.");

        // Añadir jugador al equipo
        const equipoRef = doc(db, "equipos", equipoId);
        await updateDoc(equipoRef, {
            jugadoresUids: arrayUnion(user.uid),
            jugadoresNombres: arrayUnion(userNameOriginal)
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
        await updateDoc(invitacionRef, { estado: "rechazada" });
        console.log("FUNC: Estado de invitación actualizado a 'rechazada'.");

        mostrarMensaje("Has rechazado la invitación.", "info", "global-mensaje");
    } catch (error) {
        console.error("FUNC: Error al rechazar invitación:", error);
        mostrarMensaje("Error al rechazar invitación: " + error.message, "error", "global-mensaje");
    }
}

// Funciones de consulta de partidos
async function populateCrearPartidoSelects() {
    console.log("FUNC: populateCrearPartidoSelects llamado.");
    const crearPartidoConEquipoSelect = document.getElementById('crearPartidoConEquipo');
    if (!crearPartidoConEquipoSelect) return;

    crearPartidoConEquipoSelect.innerHTML = '<option value="">Selecciona tu equipo</option>';

    try {
        const user = auth.currentUser;
        if (!user) {
            crearPartidoConEquipoSelect.innerHTML = '<option value="">Inicia sesión para ver equipos</option>';
            return;
        }

        const qJugadorEnEquipos = query(equiposCol, where("jugadoresUids", "array-contains", user.uid));
        const jugadorEquiposSnap = await getDocs(qJugadorEnEquipos);
        
        let misEquiposDisponibles = [];
        jugadorEquiposSnap.forEach(doc => {
            misEquiposDisponibles.push({ id: doc.id, nombre: doc.data().nombre });
        });
        console.log("FUNC: Equipos disponibles para crear partido:", misEquiposDisponibles.length);

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

    } catch (error) {
        console.error("FUNC: Error al cargar selects de creación de partido:", error);
        mostrarMensaje("Error al cargar opciones de equipos: " + error.message, "error", "global-mensaje");
    }
}

async function cargarPartidos() {
  console.log("FUNC: cargarPartidos llamado.");
  const lista = document.getElementById("lista-partidos");
  if (!lista) return;
  lista.innerHTML = "";

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  try {
    const snapshot = await getDocs(partidosCol);
    if (snapshot.empty) {
      lista.innerHTML = "<p>No hay partidos disponibles en este momento.</p>";
      console.log("FUNC: No hay partidos disponibles.");
      return;
    }
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
      
      const jugadoresConfirmados1 = p.jugadoresEquipo1Nombres || [];
      const jugadoresReserva1 = p.jugadoresEquipo1ReservaNombres || [];

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

async function crearPartido() {
  console.log("FUNC: crearPartido llamado.");
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

  const equipoCreadorRef = doc(db, "equipos", crearPartidoConEquipoId);
  try {
      const equipoCreadorSnap = await getDoc(equipoCreadorRef);
      if (!equipoCreadorSnap.exists()) {
          mostrarMensaje("Error: El equipo seleccionado para crear el partido no es válido.", "error", "mensaje-crear");
          return;
      }
      const equipoCreadorData = equipoCreadorSnap.data();

      if (!equipoCreadorData.jugadoresUids.includes(currentUser.uid)) {
          mostrarMensaje("No eres parte del equipo seleccionado para crear el partido.", "error", "mensaje-crear");
          return;
      }

      let cuposPorEquipo = 0;
      switch(tipoFutbol) {
          case "Futbol 5": cuposPorEquipo = 5; break;
          case "Futbol 7": cuposPorEquipo = 7; break;
          default:
              mostrarMensaje("Tipo de fútbol no válido.", "error", "mensaje-crear");
              return;
      }

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
      
      const jugadoresEquipoCreadorUids = equipoCreadorData.jugadoresUids || [];
      const jugadoresEquipoCreadorNombres = equipoCreadorData.jugadoresNombres || [];

      const maxJugadoresConfirmados = cuposPorEquipo;
      const maxJugadoresConReserva = tipoFutbol === "Futbol 5" ? 7 : 9;

      let jugadoresConfirmadosEquipo1 = [];
      let jugadoresReservaEquipo1 = [];

      for (let i = 0; i < jugadoresEquipoCreadorUids.length; i++) {
          if (i < maxJugadoresConfirmados) {
              jugadoresConfirmadosEquipo1.push({ uid: jugadoresEquipoCreadorUids[i], nombre: jugadoresEquipoCreadorNombres[i] });
          } else if (jugadoresReservaEquipo1.length < (maxJugadoresConReserva - maxJugadoresConfirmados)) {
              jugadoresReservaEquipo1.push({ uid: jugadoresEquipoCreadorUids[i], nombre: jugadoresEquipoCreadorNombres[i] });
          } else {
              break; 
          }
      }

      if (jugadoresConfirmadosEquipo1.length < maxJugadoresConfirmados) {
          mostrarMensaje(`Tu equipo (${equipoCreadorData.nombre}) tiene ${jugadoresConfirmadosEquipo1.length} jugadores. Necesita al menos ${maxJugadoresConfirmados} para crear este partido de ${tipoFutbol}.`, "error", "mensaje-crear");
          return;
      }

      const partido = {
        lugar: lugar,
        fecha: fechaInput,
        tipoFutbol: tipoFutbol,
        cupos: cuposPorEquipo,
        creadorUid: currentUser.uid,
        creadorEmail: currentUser.email,
        equipo1Id: crearPartidoConEquipoId,
        equipo1Nombre: equipoCreadorData.nombre,
        equipo2Id: null,
        equipo2Nombre: null,
        jugadoresEquipo1Uids: jugadoresConfirmadosEquipo1.map(j => j.uid),
        jugadoresEquipo1Nombres: jugadoresConfirmadosEquipo1.map(j => j.nombre),
        jugadoresEquipo1ReservaUids: jugadoresReservaEquipo1.map(j => j.uid),
        jugadoresEquipo1ReservaNombres: jugadoresReservaEquipo1.map(j => j.nombre),
        jugadoresEquipo2Uids: [], 
        jugadoresEquipo2Nombres: [],
        jugadoresEquipo2ReservaUids: [],
        jugadoresEquipo2ReservaNombres: []
      };

      await addDoc(partidosCol, partido);
      console.log("FUNC: Partido creado exitosamente.");
      mostrarMensaje("¡Partido creado exitosamente!", "exito", "global-mensaje");
      
      document.getElementById('crearPartidoConEquipo').value = '';
      document.getElementById("lugar").value = '';
      document.getElementById("fecha").value = '';
      document.getElementById('tipoFutbol').value = '';
      navigateTo('partidos');
  } catch (e) {
      console.error("FUNC: Error al crear partido:", e);
      mostrarMensaje("Error al crear partido: " + e.message, "error", "mensaje-crear");
  }
}

async function cargarMisPartidos() {
  console.log("FUNC: cargarMisPartidos llamado.");
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
    console.log("FUNC: Equipos del usuario actual:", misEquiposIds);

    if (misEquiposIds.length === 0) {
        cont.innerHTML = "<p>No estás inscrito en ningún equipo. ¡Crea o únete a uno para ver tus partidos!</p>";
        return;
    }

    const qPartidosEquipo1 = query(partidosCol, where("equipo1Id", "in", misEquiposIds));
    const snapshotEquipo1 = await getDocs(qPartidosEquipo1);

    const qPartidosEquipo2 = query(partidosCol, where("equipo2Id", "in", misEquiposIds));
    const snapshotEquipo2 = await getDocs(qPartidosEquipo2);

    const allMyMatches = new Map();
    snapshotEquipo1.forEach(doc => allMyMatches.set(doc.id, { id: doc.id, data: doc.data() }));
    snapshotEquipo2.forEach(doc => allMyMatches.set(doc.id, { id: doc.id, data: doc.data() }));

    console.log("FUNC: Total de partidos relacionados:", allMyMatches.size);

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

      const jugadoresConfirmados1 = p.jugadoresEquipo1Nombres || [];
      const jugadoresReserva1 = p.jugadoresEquipo1ReservaNombres || [];

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
  console.log("FUNC: unirseAPartido llamado.");
  const currentUser = auth.currentUser;
  if (!currentUser) {
    mostrarMensaje("Debes iniciar sesión para unirte a un partido.", "error", "global-mensaje");
    navigateTo('cuenta');
    return;
  }

  const userDocRef = doc(db, "usuarios", currentUser.uid);
  const userDocSnap = await getDoc(userDocRef);
  if (!userDocSnap.exists() || !userDocSnap.data().esCapitan || userDocSnap.data().equipoCapitaneadoId !== miEquipoId) {
      mostrarMensaje("Solo los capitanes pueden unir su equipo a un partido.", "error", "global-mensaje");
      return;
  }

  if (partidoData.equipo2Id) {
    mostrarMensaje("Este partido ya tiene un equipo rival.", "info", "global-mensaje");
    cargarPartidos();
    return;
  }

  if (partidoData.equipo1Id === miEquipoId) {
      mostrarMensaje("No puedes unirte a tu propio partido como rival.", "info", "global-mensaje");
      return;
  }

  const partidoRef = doc(db, "partidos", partidoId);

  const equipoQueSeUneRef = doc(db, "equipos", miEquipoId);
  try {
      const equipoQueSeUneSnap = await getDoc(equipoQueSeUneRef);
      if (!equipoQueSeUneSnap.exists()) {
          mostrarMensaje("Error: Tu equipo no se encontró. No puedes unirte al partido.", "error", "global-mensaje");
          return;
      }
      const equipoQueSeUneData = equipoQueSeUneSnap.data();
      const jugadoresEquipoQueSeUneUids = equipoQueSeUneData.jugadoresUids || [];
      const jugadoresEquipoQueSeUneNombres = equipoQueSeUneData.jugadoresNombres || [];

      const maxJugadoresConfirmados = partidoData.cupos;
      const maxJugadoresConReserva = partidoData.tipoFutbol === "Futbol 5" ? 7 : 9;

      let jugadoresConfirmados = [];
      let jugadoresReserva = [];

      if (jugadoresEquipoQueSeUneUids.length < maxJugadoresConfirmados) {
          mostrarMensaje(`Tu equipo tiene ${jugadoresEquipoQueSeUneUids.length} jugadores. Necesita al menos ${maxJugadoresConfirmados} para este partido de ${partidoData.tipoFutbol}.`, "error", "global-mensaje");
          return;
      }
      
      for (let i = 0; i < jugadoresEquipoQueSeUneUids.length; i++) {
          if (i < maxJugadoresConfirmados) {
              jugadoresConfirmados.push({ uid: jugadoresEquipoQueSeUneUids[i], nombre: jugadoresEquipoQueSeUneNombres[i] });
          } else if (jugadoresReserva.length < (maxJugadoresConReserva - maxJugadoresConfirmados)) {
              jugadoresReserva.push({ uid: jugadoresEquipoQueSeUneUids[i], nombre: jugadoresEquipoQueSeUneNombres[i] });
          } else {
              break; 
          }
      }

      await updateDoc(partidoRef, {
        equipo2Id: miEquipoId,
        equipo2Nombre: miEquipoNombre,
        jugadoresEquipo2Uids: jugadoresConfirmados.map(j => j.uid),
        jugadoresEquipo2Nombres: jugadoresConfirmados.map(j => j.nombre),
        jugadoresEquipo2ReservaUids: jugadoresReserva.map(j => j.uid),
        jugadoresEquipo2ReservaNombres: jugadoresReserva.map(j => j.nombre)
      });
      console.log("FUNC: Equipo unido al partido exitosamente.");
      mostrarMensaje("Tu equipo se ha unido al partido exitosamente!", "exito", "global-mensaje");
      cargarPartidos();
      cargarMisPartidos();
  } catch (e) {
    console.error("FUNC: Error al unirse al partido:", e);
    mostrarMensaje("Error al unirse al partido: " + e.message, "error", "global-mensaje");
  }
};


// --- 3. LÓGICA DE NAVEGACIÓN Y AUTENTICACIÓN (QUEDAN ABAJO PARA ACCEDER A TODAS LAS FUNCIONES ANTERIORES) ---

// onAuthStateChanged se llama cuando el estado de autenticación cambia (login, logout)
onAuthStateChanged(auth, async user => {
  console.log("AUTH: onAuthStateChanged disparado. User object:", user ? "UID: " + user.uid : "null");
  if (user) {
    const userDocRef = doc(db, "usuarios", user.uid);
    
    console.log("AUTH: Intentando obtener/crear documento de usuario de Firestore para UID:", user.uid);
    try {
        const userDocSnap = await getDoc(userDocRef);
        
        if (!userDocSnap.exists()) {
            console.warn("AUTH: Documento de usuario NO existe en Firestore para UID:", user.uid, ". Creándolo ahora.");
            await setDoc(userDocRef, {
                email: user.email,
                nombre: (user.displayName || user.email.split('@')[0]).toLowerCase(),
                nombreOriginal: user.displayName || user.email.split('@')[0],
                uid: user.uid,
                esCapitan: false,
                equipoCapitaneadoId: null
            });
            console.log("AUTH: Documento de usuario creado en Firestore.");
        } else {
            console.log("AUTH: Documento de usuario existe en Firestore.");
        }
        
        displayUserProfile(user); 
        setupInvitationsListener(user.uid); 
        const currentHash = window.location.hash.substring(1);
        if (currentHash === '' || currentHash === 'cuenta') {
            console.log("AUTH: Redirigiendo a 'partidos' por defecto al loguear.");
            navigateTo('partidos');
        } else {
            console.log("AUTH: Navegando a hash actual:", currentHash);
            navigateTo(currentHash);
        }
    } catch (firestoreError) {
        console.error("AUTH: ERROR al leer/crear documento de usuario en Firestore:", firestoreError);
        mostrarMensaje("Error al cargar perfil de usuario. Contacta a soporte.", "error", "global-mensaje");
        // Opcional: Desloguear si el perfil no se puede cargar para evitar un estado inconsistente
        // signOut(auth); 
    }
  } else {
    console.log("AUTH: onAuthStateChanged: Usuario deslogueado o no detectado. Renderizando formulario.");
    renderAuthForm(false);
    if (notificationCountSpan) {
        notificationCountSpan.textContent = '0';
        notificationCountSpan.style.display = 'none';
    }
    if (unsubscribeInvitationsListener) { // Si hay un listener activo, desuscribirse al desloguear
        unsubscribeInvitationsListener(); 
        unsubscribeInvitationsListener = null;
    }

    const currentHash = window.location.hash.substring(1);
    // Solo redirigir a #cuenta si la página actual es una protegida
    if (['explorar', 'crear', 'partidos', 'notificaciones', 'torneo'].includes(currentHash)) {
        console.log("AUTH: Redirigiendo a 'cuenta' porque la página actual es protegida.");
        navigateTo('cuenta');
    } else {
        console.log("AUTH: Permaneciendo en la página actual (no protegida).");
    }
  }
});

// Event Listener para cuando el DOM está completamente cargado
document.addEventListener('DOMContentLoaded', () => {
    console.log("APP: DOMContentLoaded disparado.");
    // Adjuntar el listener para el botón de crear partido
    const btnCrear = document.getElementById("btnCrear");
    if (btnCrear) {
        btnCrear.addEventListener("click", crearPartido);
        console.log("APP: Listener para btnCrear adjuntado.");
    } else {
        console.warn("APP: btnCrear no encontrado al cargar el DOM.");
    }
    // Determinar la página inicial al cargar la SPA
    const initialPath = window.location.hash.substring(1) || 'cuenta';
    console.log("APP: Ruta inicial determinada:", initialPath);
    // La navegación inicial se maneja dentro de onAuthStateChanged
    // para asegurar que el estado de autenticación se resuelva primero.
});
    const initialPath = window.location.hash.substring(1) || 'cuenta';
    console.log("DOMContentLoaded: Navegando a la ruta inicial:", initialPath); // Depuración
    navigateTo(initialPath);
});
