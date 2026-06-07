import os
from pydantic_ai import RunContext
from models.resume_retriever_agent_dependency import ResumeRetrieverAgentDependency
from models.resume import Resume
from typing import List
from helpers import rag_db
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()


def retrieve_all_resumes(ctx: RunContext[ResumeRetrieverAgentDependency]) -> List[Resume]:
    """
    Retrieve ALL resumes from the database without any filtering.
    
    Use this tool when you need to score or evaluate ALL candidates, 
    not just the most relevant ones. This returns every resume in the database.

    Returns:
        List[Resume]: List of all Resume objects containing candidate information.
            Each Resume object has:
            - label: Identifier or name for the resume
            - content: Full text content of the resume
    """
    print('retrieve_all_resumes tool invoked')
    resume_retriever_agent_deps: ResumeRetrieverAgentDependency = ctx.deps
    
    # Retrieve all resumes without relevance filtering
    retrieved_docs: List[dict] = rag_db.retrieve_all_docs(
        table_name=resume_retriever_agent_deps.rag_table_name,
        limit=resume_retriever_agent_deps.limit)
    
    retrieved_resumes: List[Resume] = []
    for retrieved_doc in retrieved_docs:
        retrieved_resume = Resume(label=retrieved_doc['label'], content=retrieved_doc['text'],
                                  relevance_score=retrieved_doc.get('_relevance_score', 0))
        retrieved_resumes.append(retrieved_resume)
    
    print(f'retrieved {len(retrieved_resumes)} resumes: {[r.label for r in retrieved_resumes]}')
    return retrieved_resumes