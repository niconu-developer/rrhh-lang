if (!currentUser()) {
  window.location.href = "./login.html?next=index.html";
} else {
  renderSessionActions(document.querySelector("#sessionActions"));
  renderHome();
}

async function renderHome() {
  const homeGrid = document.querySelector("#homeGrid");
  const moduleById = new Map(SYSTEM_MODULES.map((module) => [module.id, module]));
  const currentPerson = await loadCurrentPerson();
  const groups = [
    { title: "Gestión", modules: ["plan", "incidencias", "aprobaciones", "operaciones"] },
    { title: "Datos", modules: ["dashboard", "reportes", "analisis", "facturacion", "importacion", "liquidacion"] },
    { title: "Parámetros", modules: ["config", "personal"] },
    { title: "Recursos", modules: ["marcas", "mis-marcas", "reloj"] },
  ];

  homeGrid.innerHTML = groups
    .map((group) => {
      const modules = group.modules
        .map((id) => moduleById.get(id))
        .filter((module) => module && canAccessModule(module.id) && canShowHomeModule(module, currentPerson));
      if (!modules.length) return "";
      return `<section class="home-group">
        <h2>${group.title}</h2>
        <div class="home-row">
          ${modules.map(homeCard).join("")}
        </div>
      </section>`;
    })
    .join("");
}

async function loadCurrentPerson() {
  const user = currentUser();
  if (!user?.personName) return null;
  try {
    const response = await fetch(`${apiBase()}/personas`);
    const people = await response.json();
    if (!response.ok) return null;
    return people.find((person) => person.nombre === user.personName) || null;
  } catch (error) {
    return null;
  }
}

function canShowHomeModule(module, currentPerson) {
  return true;
}

function homeCard(module) {
  return `<a class="home-card" href="${module.href}">
    <span>${module.title}</span>
    <strong>${module.text}</strong>
  </a>`;
}
