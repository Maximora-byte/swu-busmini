/** Compare explicit qualifiers after search normalization; an omitted qualifier stays broad. */
export function hasConflictingCampusIdentity(query: string, candidate: string): boolean {
  const qualifiers: readonly RegExp[] = [
    /(?:^|[^a-z])([a-z])(?=[栋幢座])/g,
    /[南北]区/g,
    /[橘楠梅桃李杏]园/g,
  ]
  return qualifiers.some((pattern) => {
    const queryValues = [...query.matchAll(pattern)].map((match) => match[1] ?? match[0])
    const candidateValues = [...candidate.matchAll(pattern)].map((match) => match[1] ?? match[0])
    return queryValues.length > 0 && candidateValues.length > 0 &&
      !queryValues.some((value) => candidateValues.includes(value))
  })
}
