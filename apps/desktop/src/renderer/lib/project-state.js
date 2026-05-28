export function updateAtPath(source, path, value) {
  const next = structuredClone(source);
  let target = next;

  for (let i = 0; i < path.length - 1; i += 1) {
    target = target[path[i]];
  }

  target[path[path.length - 1]] = value;
  return next;
}

export function updateDriver(source, driverId, patch) {
  const next = structuredClone(source);
  const index = next.drivers.findIndex((driver) => driver.id === driverId);
  if (index >= 0) {
    next.drivers[index] = {
      ...next.drivers[index],
      ...patch
    };
  }
  return next;
}

export function updateDriverSource(source, driverId, patch) {
  const next = structuredClone(source);
  const driver = next.drivers.find((candidate) => candidate.id === driverId);
  if (driver) {
    driver.source = {
      ...driver.source,
      ...patch
    };
  }
  return next;
}

