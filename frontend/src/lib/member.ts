type Person = { fname: string; lname: string; avatarUrl?: string | null }

/** Avatars are served same-origin through the dev proxy (/uploads). */
export function avatarSrc(person: Pick<Person, 'avatarUrl'>) {
   return person.avatarUrl || undefined
}

export function initials(person: Pick<Person, 'fname' | 'lname'>) {
   return ((person.fname?.[0] ?? '') + (person.lname?.[0] ?? '')).toUpperCase()
}
