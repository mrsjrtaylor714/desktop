import * as chai from 'chai'
const expect = chai.expect

import * as path from 'path'

const fs = require('fs-extra')
const temp = require('temp').track()

import Repository from '../src/models/repository'
import { WorkingDirectoryFileChange, FileStatus } from '../src/models/status'
import { Diff, DiffSelection, DiffSelectionType, DiffLineType } from '../src/models/diff'
import { createPatchesForModifiedFile } from '../src/lib/patch-formatter'
import { LocalGitOperations } from '../src/lib/local-git-operations'

describe('patch formatting', () => {
  let repository: Repository | null = null

  function setupTestRepository(repositoryName: string): string {
    const testRepoFixturePath = path.join(__dirname, 'fixtures', repositoryName)
    const testRepoPath = temp.mkdirSync('desktop-git-test-')
    fs.copySync(testRepoFixturePath, testRepoPath)

    fs.renameSync(path.join(testRepoPath, '_git'), path.join(testRepoPath, '.git'))

    return testRepoPath
  }

  function selectLinesInSection(diff: Diff, index: number, selected: boolean): Map<number, boolean> {

      const selectedLines = new Map<number, boolean>()

      const section = diff.sections[index]
      section.lines.forEach((line, index) => {
        if (line.type === DiffLineType.Context || line.type === DiffLineType.Hunk) {
          return
        }

        const absoluteIndex = section.unifiedDiffStart + index
        selectedLines.set(absoluteIndex, selected)
      })

      return selectedLines
  }

  function mergeSelections(array: ReadonlyArray<Map<number, boolean>>): Map<number, boolean> {
    const selectedLines = new Map<number, boolean>()

    for (let i = 0; i < array.length; i++) {
      const a = array[i]
      for (const v of a.entries()) {
        selectedLines.set(v[0], v[1])
      }
    }

    return selectedLines
  }

  after(() => {
    temp.cleanupSync()
  })

  describe('createPatchesForModifiedFile', () => {

    beforeEach(() => {
      const testRepoPath = setupTestRepository('repo-with-changes')
      repository = new Repository(testRepoPath, -1, null)
    })

    it('creates right patch when first hunk is selected', async () => {

      const modifiedFile = 'modified-file.md'

      const unselectedFile = new DiffSelection(DiffSelectionType.None, new Map<number, boolean>())
      const file = new WorkingDirectoryFileChange(modifiedFile, FileStatus.Modified, unselectedFile)

      const diff = await LocalGitOperations.getDiff(repository!, file, null)

      // select first hunk
      const first = selectLinesInSection(diff, 0, true)
      // skip second hunk
      const second = selectLinesInSection(diff, 1, false)

      const selectedLines = mergeSelections([ first, second ])

      const selection = new DiffSelection(DiffSelectionType.Partial, selectedLines)
      const updatedFile = new WorkingDirectoryFileChange(modifiedFile, FileStatus.Modified, selection)

      const patches = createPatchesForModifiedFile(updatedFile, diff)

      expect(patches[0]).to.not.be.undefined
      expect(patches[0]).to.have.string('--- a/modified-file.md\n')
      expect(patches[0]).to.have.string('+++ b/modified-file.md\n')
      expect(patches[0]).to.have.string('@@ -4,10 +4,6 @@ ')

      expect(patches[1]).to.be.undefined
    })

    it('creates right patch when second hunk is selected', async () => {

      const modifiedFile = 'modified-file.md'
      const unselectedFile = new DiffSelection(DiffSelectionType.None, new Map<number, boolean>())
      const file = new WorkingDirectoryFileChange(modifiedFile, FileStatus.Modified, unselectedFile)

      const diff = await LocalGitOperations.getDiff(repository!, file, null)

      // skip first hunk
      const first = selectLinesInSection(diff, 0, false)
      // select second hunk
      const second = selectLinesInSection(diff, 1, true)

      const selectedLines = mergeSelections([ first, second ])

      const selection = new DiffSelection(DiffSelectionType.Partial, selectedLines)
      const updatedFile = new WorkingDirectoryFileChange(modifiedFile, FileStatus.Modified, selection)

      const patches = createPatchesForModifiedFile(updatedFile, diff)

      expect(patches[0]).to.be.undefined

      expect(patches[1]).to.not.be.undefined
      expect(patches[1]).to.have.string('--- a/modified-file.md\n')
      expect(patches[1]).to.have.string('+++ b/modified-file.md\n')
      expect(patches[1]).to.have.string('@@ -21,6 +17,10 @@')
    })
  })
})
