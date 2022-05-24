describe('My First Test', () => {
  it('visiting index should redirect', () => {
    cy.visit('/')
    //cy.contains('type').click()
    // Should be on a new URL which includes '/auth/login'
    cy.url().should('include', '/auth/login')
  })
})